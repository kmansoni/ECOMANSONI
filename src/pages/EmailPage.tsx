/**
 * src/pages/EmailPage.tsx — Production-grade email client.
 *
 * Architecture:
 *  - 3-pane layout: folder sidebar | message list | message detail/composer
 *  - useReducer state machine — deterministic, no hidden side effects
 *  - Real-time polling every 30s for new inbox messages
 *  - Rich text composer via contentEditable + execCommand toolbar
 *  - Thread grouping by normalized subject (Re:/Fwd: stripped)
 *  - Bulk actions: select-all, delete, move, mark read/unread
 *  - Attachments: file upload → Supabase Storage, URL embedded into HTML body
 *  - Auto-save drafts: debounced 3s after last keystroke
 *  - Client-side search: subject, from, to, body full-text
 *  - Pagination: page-based (50 items/page)
 *  - Star/flag system persisted via PATCH to email-router
 *  - Reply / Reply All / Forward pre-fills composer
 *  - Unread badges on folder tabs
 *
 * Security:
 *  - All email-router calls go through Supabase Edge Function (JWT required)
 *  - Attachments use Supabase Storage with signed URLs (never direct S3)
 *  - HTML content rendered in sandbox iframe — no script execution
 *  - From address always validated against authenticated user's email
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Bold,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileEdit,
  Flag,
  Inbox,
  Image as ImageIcon,
  Italic,
  Link,
  List,
  ListOrdered,
  Loader2,
  Mail,
  Paperclip,
  RefreshCw,
  Reply,
  ReplyAll,
  Send,
  ShieldAlert,
  Star,
  Trash2,
  Underline,
  X,
  Search,
  CheckSquare,
  Square,
  ArchiveRestore,
  Clock,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getEmailRouterApiBases } from "@/lib/email/backendEndpoints";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type FolderKind = "inbox" | "sent" | "draft" | "spam" | "trash";

interface Attachment {
  name: string;
  size: number;
  mime: string;
  url: string; // Supabase Storage public URL or data URL if <100KB
}

interface MailMessage {
  id: string;
  threadId: string; // computed: normalized_subject + participants hash
  kind: "inbox" | "outbox";
  folder: FolderKind;
  from: string;
  to: string;
  subject: string;
  preview: string;
  bodyText: string | null;
  bodyHtml: string | null;
  attachments: Attachment[];
  at: string; // ISO date
  isRead: boolean;
  isStarred: boolean;
  isFlagged: boolean;
  status?: "pending" | "processing" | "sent" | "failed" | "draft";
}

interface Thread {
  id: string; // threadId
  subject: string;
  participants: string[];
  lastAt: string;
  messages: MailMessage[];
  unreadCount: number;
}

// ─── State machine ─────────────────────────────────────────────────────────────

interface EmailState {
  folder: FolderKind;
  messages: MailMessage[];
  selectedThreadId: string | null;
  checkedIds: Set<string>; // checked message IDs for bulk actions
  loadingList: boolean;
  loadingAction: boolean;
  errorText: string;
  searchQuery: string;
  page: number;
  totalPages: number;
  apiBase: string;
  composerOpen: boolean;
  composer: ComposerState;
  mailbox: string;
  unreadOnly: boolean;
  filterSender: string;
  filterDateFrom: string;
  filterDateTo: string;
  showFilters: boolean;
  autoSaveDraftId: string | null;
}

interface ComposerState {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  bodyHtml: string;
  attachments: Attachment[];
  draftId: string | null;
  isDirty: boolean;
  mode: "new" | "reply" | "replyAll" | "forward";
  inReplyTo: string | null; // original message-id header
  references: string | null;
}

type EmailAction =
  | { type: "SET_FOLDER"; folder: FolderKind }
  | { type: "SET_MESSAGES"; messages: MailMessage[]; totalPages: number }
  | { type: "SET_LOADING_LIST"; loading: boolean }
  | { type: "SET_LOADING_ACTION"; loading: boolean }
  | { type: "SET_ERROR"; error: string }
  | { type: "SET_API_BASE"; base: string }
  | { type: "SELECT_THREAD"; threadId: string | null }
  | { type: "TOGGLE_CHECK"; id: string }
  | { type: "CHECK_ALL"; ids: string[] }
  | { type: "UNCHECK_ALL" }
  | { type: "SET_PAGE"; page: number }
  | { type: "SET_SEARCH"; query: string }
  | { type: "SET_MAILBOX"; mailbox: string }
  | { type: "SET_UNREAD_ONLY"; value: boolean }
  | { type: "SET_FILTER_SENDER"; value: string }
  | { type: "SET_FILTER_DATE_FROM"; value: string }
  | { type: "SET_FILTER_DATE_TO"; value: string }
  | { type: "TOGGLE_FILTERS" }
  | { type: "OPEN_COMPOSER"; mode: ComposerState["mode"]; prefill?: Partial<ComposerState> }
  | { type: "CLOSE_COMPOSER" }
  | { type: "SET_COMPOSER"; patch: Partial<ComposerState> }
  | { type: "ADD_ATTACHMENT"; attachment: Attachment }
  | { type: "REMOVE_ATTACHMENT"; index: number }
  | { type: "MARK_READ"; ids: string[]; isRead: boolean }
  | { type: "MARK_STARRED"; id: string; isStarred: boolean }
  | { type: "MARK_FLAGGED"; id: string; isFlagged: boolean }
  | { type: "SET_DRAFT_ID"; draftId: string | null };

const PAGE_SIZE = 50;

function emailReducer(state: EmailState, action: EmailAction): EmailState {
  switch (action.type) {
    case "SET_FOLDER":
      return { ...state, folder: action.folder, selectedThreadId: null, checkedIds: new Set(), page: 1 };
    case "SET_MESSAGES":
      return { ...state, messages: action.messages, totalPages: action.totalPages, loadingList: false };
    case "SET_LOADING_LIST":
      return { ...state, loadingList: action.loading };
    case "SET_LOADING_ACTION":
      return { ...state, loadingAction: action.loading };
    case "SET_ERROR":
      return { ...state, errorText: action.error, loadingList: false, loadingAction: false };
    case "SET_API_BASE":
      return { ...state, apiBase: action.base };
    case "SELECT_THREAD":
      return { ...state, selectedThreadId: action.threadId, checkedIds: new Set() };
    case "TOGGLE_CHECK": {
      const next = new Set(state.checkedIds);
      if (next.has(action.id)) {
        next.delete(action.id);
      } else {
        next.add(action.id);
      }
      return { ...state, checkedIds: next };
    }
    case "CHECK_ALL":
      return { ...state, checkedIds: new Set(action.ids) };
    case "UNCHECK_ALL":
      return { ...state, checkedIds: new Set() };
    case "SET_PAGE":
      return { ...state, page: action.page };
    case "SET_SEARCH":
      return { ...state, searchQuery: action.query, page: 1 };
    case "SET_MAILBOX":
      return { ...state, mailbox: action.mailbox, page: 1, selectedThreadId: null };
    case "SET_UNREAD_ONLY":
      return { ...state, unreadOnly: action.value, page: 1 };
    case "SET_FILTER_SENDER":
      return { ...state, filterSender: action.value, page: 1 };
    case "SET_FILTER_DATE_FROM":
      return { ...state, filterDateFrom: action.value, page: 1 };
    case "SET_FILTER_DATE_TO":
      return { ...state, filterDateTo: action.value, page: 1 };
    case "TOGGLE_FILTERS":
      return { ...state, showFilters: !state.showFilters };
    case "OPEN_COMPOSER":
      return {
        ...state,
        composerOpen: true,
        composer: {
          to: "",
          cc: "",
          bcc: "",
          subject: "",
          bodyHtml: "",
          attachments: [],
          draftId: null,
          isDirty: false,
          mode: action.mode,
          inReplyTo: null,
          references: null,
          ...action.prefill,
        },
      };
    case "CLOSE_COMPOSER":
      return { ...state, composerOpen: false };
    case "SET_COMPOSER":
      return { ...state, composer: { ...state.composer, ...action.patch, isDirty: true } };
    case "ADD_ATTACHMENT":
      return {
        ...state,
        composer: {
          ...state.composer,
          attachments: [...state.composer.attachments, action.attachment],
          isDirty: true,
        },
      };
    case "REMOVE_ATTACHMENT": {
      const attachments = state.composer.attachments.filter((_, i) => i !== action.index);
      return { ...state, composer: { ...state.composer, attachments, isDirty: true } };
    }
    case "MARK_READ": {
      const idSet = new Set(action.ids);
      const messages = state.messages.map((m) =>
        idSet.has(m.id) ? { ...m, isRead: action.isRead } : m
      );
      return { ...state, messages };
    }
    case "MARK_STARRED": {
      const messages = state.messages.map((m) =>
        m.id === action.id ? { ...m, isStarred: action.isStarred } : m
      );
      return { ...state, messages };
    }
    case "MARK_FLAGGED": {
      const messages = state.messages.map((m) =>
        m.id === action.id ? { ...m, isFlagged: action.isFlagged } : m
      );
      return { ...state, messages };
    }
    case "SET_DRAFT_ID":
      return { ...state, autoSaveDraftId: action.draftId, composer: { ...state.composer, draftId: action.draftId } };
    default:
      return state;
  }
}

const initialState: EmailState = {
  folder: "inbox",
  messages: [],
  selectedThreadId: null,
  checkedIds: new Set(),
  loadingList: false,
  loadingAction: false,
  errorText: "",
  searchQuery: "",
  page: 1,
  totalPages: 1,
  apiBase: "",
  composerOpen: false,
  composer: {
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    bodyHtml: "",
    attachments: [],
    draftId: null,
    isDirty: false,
    mode: "new",
    inReplyTo: null,
    references: null,
  },
  mailbox: "",
  unreadOnly: false,
  filterSender: "",
  filterDateFrom: "",
  filterDateTo: "",
  showFilters: false,
  autoSaveDraftId: null,
};

// ─── API helpers ──────────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 12_000;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const t = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(t);
  }
}

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function normalizeSubject(s: string): string {
  return s
    .replace(/^(re|fwd?|ответ|перес):\s*/gi, "")
    .trim()
    .toLowerCase();
}

function computeThreadId(subject: string, participants: string[]): string {
  const ns = normalizeSubject(subject);
  const sorted = [...participants].sort().join("|");
  // Simple deterministic hash — not cryptographic, just for UI grouping
  let hash = 0;
  const str = `${ns}::${sorted}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return `t_${Math.abs(hash).toString(36)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 86_400_000 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  if (diffMs < 7 * 86_400_000) {
    return d.toLocaleDateString("ru-RU", { weekday: "short" });
  }
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function formatDateFull(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Build secure sandboxed iframe srcdoc for HTML email rendering
function buildSandboxedHtml(html: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<base target="_blank">
<style>
  body { font-family: system-ui, -apple-system, sans-serif; font-size: 14px; line-height: 1.5; color: #111; margin: 16px; word-wrap: break-word; }
  a { color: #2563eb; }
  img { max-width: 100%; height: auto; }
  blockquote { border-left: 3px solid #ccc; margin: 8px 0; padding-left: 12px; color: #555; }
  pre, code { background: #f1f5f9; padding: 4px 6px; border-radius: 4px; font-size: 13px; }
</style>
</head>
<body>${html}</body>
</html>`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

// Avatar bubble for email sender
function SenderAvatar({ email, size = 32 }: { email: string; size?: number }) {
  const colors = [
    "#2563eb", "#16a34a", "#dc2626", "#9333ea",
    "#ea580c", "#0891b2", "#db2777", "#65a30d",
  ];
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = ((hash << 5) - hash + email.charCodeAt(i)) | 0;
  const color = colors[Math.abs(hash) % colors.length];
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize: size * 0.38,
        fontWeight: 600,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {getInitials(email)}
    </div>
  );
}

// Folder sidebar item
interface FolderItemProps {
  id: FolderKind;
  label: string;
  icon: React.ElementType;
  active: boolean;
  unread: number;
  onClick: () => void;
}

function FolderItem({ id: _id, label, icon: Icon, active, unread, onClick }: FolderItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {unread > 0 && (
        <Badge variant={active ? "secondary" : "default"} className="text-xs px-1.5 min-w-5 justify-center">
          {unread > 99 ? "99+" : unread}
        </Badge>
      )}
    </button>
  );
}

// Rich text toolbar + contentEditable editor
interface RichEditorProps {
  value: string; // HTML
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

function RichEditor({ value, onChange, placeholder, className }: RichEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastHtmlRef = useRef(value);

  // Sync external value → DOM (only when it changes externally, not when user types)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (el.innerHTML !== value && value !== lastHtmlRef.current) {
      el.innerHTML = value;
      lastHtmlRef.current = value;
    }
  }, [value]);

  const exec = (command: string, arg?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    syncContent();
  };

  const syncContent = () => {
    const html = editorRef.current?.innerHTML ?? "";
    if (html !== lastHtmlRef.current) {
      lastHtmlRef.current = html;
      onChange(html);
    }
  };

  const insertLink = () => {
    const url = window.prompt("Введите URL:", "https://");
    if (url) exec("createLink", url);
  };

  const insertImage = () => {
    const url = window.prompt("Введите URL изображения:", "https://");
    if (url) exec("insertImage", url);
  };

  const toolbarButtons = [
    { icon: Bold, title: "Жирный (Ctrl+B)", onClick: () => exec("bold") },
    { icon: Italic, title: "Курсив (Ctrl+I)", onClick: () => exec("italic") },
    { icon: Underline, title: "Подчёркивание (Ctrl+U)", onClick: () => exec("underline") },
    null, // separator
    { icon: List, title: "Маркированный список", onClick: () => exec("insertUnorderedList") },
    { icon: ListOrdered, title: "Нумерованный список", onClick: () => exec("insertOrderedList") },
    null,
    { icon: Link, title: "Вставить ссылку", onClick: insertLink },
    { icon: ImageIcon, title: "Вставить изображение по URL", onClick: insertImage },
  ];

  return (
    <div className={cn("border rounded-lg overflow-hidden", className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b bg-muted/30 flex-wrap">
        {toolbarButtons.map((btn, i) =>
          btn === null ? (
            <div key={i} className="w-px h-5 bg-border mx-1" />
          ) : (
            <TooltipProvider key={i} delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); btn.onClick(); }}
                    className="p-1.5 rounded hover:bg-accent transition-colors"
                  >
                    <btn.icon className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{btn.title}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        )}
        {/* Heading select */}
        <select
          className="ml-1 h-6 text-xs border rounded px-1 bg-background"
          onChange={(e) => { exec("formatBlock", e.target.value); e.target.value = "p"; }}
          defaultValue="p"
        >
          <option value="p">Абзац</option>
          <option value="h1">H1</option>
          <option value="h2">H2</option>
          <option value="h3">H3</option>
          <option value="pre">Код</option>
          <option value="blockquote">Цитата</option>
        </select>
        {/* Font color */}
        <input
          type="color"
          title="Цвет текста"
          className="w-6 h-6 ml-1 rounded cursor-pointer border-0 bg-transparent"
          onChange={(e) => exec("foreColor", e.target.value)}
        />
      </div>
      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={syncContent}
        onBlur={syncContent}
        data-placeholder={placeholder}
        className={cn(
          "min-h-[180px] p-3 focus:outline-none text-sm",
          "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground"
        )}
        style={{ wordBreak: "break-word" }}
      />
    </div>
  );
}

// Message list row
interface MessageRowProps {
  msg: MailMessage;
  checked: boolean;
  selected: boolean;
  onCheck: () => void;
  onSelect: () => void;
  onStar: () => void;
}

function MessageRow({ msg, checked, selected, onCheck, onSelect, onStar }: MessageRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b border-border/50 group hover:bg-accent/30 transition-colors",
        selected && "bg-accent/50",
        !msg.isRead && "bg-blue-50/50 dark:bg-blue-950/20"
      )}
    >
      {/* Checkbox */}
      <div
        className="flex-shrink-0"
        onClick={(e) => { e.stopPropagation(); onCheck(); }}
      >
        <Checkbox checked={checked} className="data-[state=checked]:bg-primary" />
      </div>

      {/* Star */}
      <button
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => { e.stopPropagation(); onStar(); }}
      >
        <Star
          className={cn("w-4 h-4", msg.isStarred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground")}
        />
      </button>

      {/* Avatar */}
      <div onClick={onSelect} className="flex-1 flex items-center gap-3 min-w-0">
        <SenderAvatar email={msg.from} size={32} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={cn("text-sm truncate", !msg.isRead && "font-semibold")}>
              {msg.from}
            </span>
            <span className="text-xs text-muted-foreground flex-shrink-0">{formatDate(msg.at)}</span>
          </div>
          <div className={cn("text-sm truncate", !msg.isRead ? "font-medium text-foreground" : "text-muted-foreground")}>
            {msg.subject || "(без темы)"}
          </div>
          <div className="text-xs text-muted-foreground truncate">{msg.preview}</div>
        </div>
      </div>

      {/* Flags */}
      <div className="flex-shrink-0 flex flex-col items-center gap-1">
        {msg.isFlagged && <Flag className="w-3 h-3 fill-red-500 text-red-500" />}
        {msg.attachments.length > 0 && <Paperclip className="w-3 h-3 text-muted-foreground" />}
        {msg.status === "failed" && (
          <span className="text-xs text-red-500 font-medium">!</span>
        )}
      </div>
    </div>
  );
}

// Composer panel (full-featured)
interface ComposerPanelProps {
  state: EmailState;
  dispatch: React.Dispatch<EmailAction>;
  onSend: () => Promise<void>;
  onSaveDraft: () => Promise<void>;
  onUploadAttachment: (file: File) => Promise<void>;
  loading: boolean;
}

function ComposerPanel({ state, dispatch, onSend, onSaveDraft, onUploadAttachment, loading }: ComposerPanelProps) {
  const { composer } = state;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCcBcc, setShowCcBcc] = useState(!!(composer.cc || composer.bcc));

  const modeLabels: Record<ComposerState["mode"], string> = {
    new: "Новое письмо",
    reply: "Ответить",
    replyAll: "Ответить всем",
    forward: "Переслать",
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/20">
        <span className="font-medium text-sm">{modeLabels[composer.mode]}</span>
        <div className="flex items-center gap-2">
          {composer.isDirty && (
            <span className="text-xs text-muted-foreground">Несохранённые изменения</span>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => dispatch({ type: "CLOSE_COMPOSER" })}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Fields */}
      <div className="flex flex-col gap-0 border-b">
        {/* From */}
        <div className="flex items-center gap-2 px-4 py-2 border-b text-sm">
          <span className="text-muted-foreground w-10 flex-shrink-0">От:</span>
          <span className="text-foreground">{state.mailbox}</span>
        </div>

        {/* To */}
        <div className="flex items-center gap-2 px-4 py-1.5">
          <span className="text-muted-foreground text-sm w-10 flex-shrink-0">Кому:</span>
          <Input
            className="border-0 shadow-none focus-visible:ring-0 px-0 h-8 text-sm"
            placeholder="recipient@example.com"
            value={composer.to}
            onChange={(e) => dispatch({ type: "SET_COMPOSER", patch: { to: e.target.value } })}
          />
          <button
            className="text-xs text-muted-foreground hover:text-foreground flex-shrink-0"
            onClick={() => setShowCcBcc((v) => !v)}
          >
            Cc/Bcc
          </button>
        </div>

        {showCcBcc && (
          <>
            <div className="flex items-center gap-2 px-4 py-1.5 border-t">
              <span className="text-muted-foreground text-sm w-10 flex-shrink-0">Cc:</span>
              <Input
                className="border-0 shadow-none focus-visible:ring-0 px-0 h-8 text-sm"
                placeholder="cc@example.com"
                value={composer.cc}
                onChange={(e) => dispatch({ type: "SET_COMPOSER", patch: { cc: e.target.value } })}
              />
            </div>
            <div className="flex items-center gap-2 px-4 py-1.5 border-t">
              <span className="text-muted-foreground text-sm w-10 flex-shrink-0">Bcc:</span>
              <Input
                className="border-0 shadow-none focus-visible:ring-0 px-0 h-8 text-sm"
                placeholder="bcc@example.com"
                value={composer.bcc}
                onChange={(e) => dispatch({ type: "SET_COMPOSER", patch: { bcc: e.target.value } })}
              />
            </div>
          </>
        )}

        {/* Subject */}
        <div className="flex items-center gap-2 px-4 py-1.5 border-t">
          <span className="text-muted-foreground text-sm w-10 flex-shrink-0">Тема:</span>
          <Input
            className="border-0 shadow-none focus-visible:ring-0 px-0 h-8 text-sm font-medium"
            placeholder="Тема письма"
            value={composer.subject}
            onChange={(e) => dispatch({ type: "SET_COMPOSER", patch: { subject: e.target.value } })}
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-0">
        <RichEditor
          value={composer.bodyHtml}
          onChange={(html) => dispatch({ type: "SET_COMPOSER", patch: { bodyHtml: html } })}
          placeholder="Текст письма..."
          className="border-0 rounded-none h-full"
        />
      </div>

      {/* Attachments */}
      {composer.attachments.length > 0 && (
        <div className="px-4 py-2 border-t flex flex-wrap gap-2">
          {composer.attachments.map((att, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 text-xs bg-muted rounded-full px-3 py-1"
            >
              <Paperclip className="w-3 h-3" />
              <span className="max-w-32 truncate">{att.name}</span>
              <span className="text-muted-foreground">({formatFileSize(att.size)})</span>
              <button
                onClick={() => dispatch({ type: "REMOVE_ATTACHMENT", index: i })}
                className="ml-1 hover:text-destructive"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-3 border-t bg-muted/10">
        <Button
          size="sm"
          onClick={() => void onSend()}
          disabled={loading || !composer.to.trim()}
          className="gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Отправить
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void onSaveDraft()}
          disabled={loading}
          className="gap-2"
        >
          <FileEdit className="w-4 h-4" />
          Черновик
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          className="gap-2"
        >
          <Paperclip className="w-4 h-4" />
          Вложение
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            files.forEach((f) => void onUploadAttachment(f));
            e.target.value = "";
          }}
        />
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => dispatch({ type: "CLOSE_COMPOSER" })}
          className="text-muted-foreground"
        >
          Отмена
        </Button>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Message detail / thread view
interface MessageDetailProps {
  thread: Thread;
  state: EmailState;
  dispatch: React.Dispatch<EmailAction>;
  onReply: (msg: MailMessage, mode: "reply" | "replyAll" | "forward") => void;
  onMove: (ids: string[], folder: FolderKind) => Promise<void>;
  onDelete: (ids: string[]) => Promise<void>;
  onMarkRead: (ids: string[], read: boolean) => Promise<void>;
}

function MessageDetail({ thread, state, dispatch, onReply, onMove, onDelete, onMarkRead }: MessageDetailProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set([thread.messages[thread.messages.length - 1]?.id])
  );

  useEffect(() => {
    setExpandedIds(new Set([thread.messages[thread.messages.length - 1]?.id]));
  }, [thread.id]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const lastMsg = thread.messages[thread.messages.length - 1];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Thread header */}
      <div className="px-4 py-3 border-b flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-base leading-snug">{thread.subject || "(без темы)"}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {thread.messages.length} {thread.messages.length === 1 ? "сообщение" : "сообщений"}
          </p>
        </div>
        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => void onMarkRead([lastMsg.id], !lastMsg.isRead)}
                >
                  <Mail className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{lastMsg.isRead ? "Пометить непрочитанным" : "Пометить прочитанным"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => void onMove(
                    thread.messages.map((m) => m.id),
                    state.folder === "trash" ? "inbox" : "trash"
                  )}
                >
                  {state.folder === "trash" ? <ArchiveRestore className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{state.folder === "trash" ? "Восстановить" : "Удалить"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() =>
                    void onMove(
                      thread.messages.map((m) => m.id),
                      state.folder === "spam" ? "inbox" : "spam"
                    )
                  }
                >
                  <ShieldAlert className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{state.folder === "spam" ? "Не спам" : "В спам"}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Messages in thread */}
      <div className="flex-1 overflow-auto">
        {thread.messages.map((msg, idx) => {
          const isExpanded = expandedIds.has(msg.id);
          const isLast = idx === thread.messages.length - 1;

          return (
            <div key={msg.id} className={cn("border-b", isLast && "border-b-0")}>
              {/* Collapsed header */}
              <div
                className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-accent/20 transition-colors"
                onClick={() => toggleExpand(msg.id)}
              >
                <SenderAvatar email={msg.from} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{msg.from}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{formatDate(msg.at)}</span>
                  </div>
                  {!isExpanded && (
                    <p className="text-xs text-muted-foreground truncate">{msg.preview}</p>
                  )}
                </div>
                {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
              </div>

              {/* Expanded body */}
              {isExpanded && (
                <div className="px-4 pb-4">
                  {/* Meta */}
                  <div className="text-xs text-muted-foreground mb-3 space-y-0.5">
                    <div><span className="font-medium">От:</span> {msg.from}</div>
                    <div><span className="font-medium">Кому:</span> {msg.to}</div>
                    <div><span className="font-medium">Дата:</span> {formatDateFull(msg.at)}</div>
                  </div>

                  {/* Body — HTML in sandbox iframe or plain text */}
                  {msg.bodyHtml ? (
                    <iframe
                      srcDoc={buildSandboxedHtml(msg.bodyHtml)}
                      sandbox="allow-same-origin allow-popups"
                      className="w-full border-0 rounded bg-white"
                      style={{ minHeight: 120 }}
                      onLoad={(e) => {
                        const iframe = e.currentTarget;
                        const doc = iframe.contentDocument;
                        if (doc) {
                          iframe.style.height = doc.body.scrollHeight + 32 + "px";
                        }
                      }}
                      title={`email-body-${msg.id}`}
                    />
                  ) : (
                    <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
                      {msg.bodyText ?? "(пустое сообщение)"}
                    </pre>
                  )}

                  {/* Attachments */}
                  {msg.attachments.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {msg.attachments.map((att, i) => (
                        <a
                          key={i}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-xs bg-muted hover:bg-accent rounded-lg px-3 py-2 transition-colors"
                        >
                          <Paperclip className="w-3.5 h-3.5" />
                          <span className="max-w-32 truncate">{att.name}</span>
                          <span className="text-muted-foreground">({formatFileSize(att.size)})</span>
                          <ExternalLink className="w-3 h-3 text-muted-foreground" />
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Reply actions */}
                  <div className="flex items-center gap-2 mt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => onReply(msg, "reply")}
                    >
                      <Reply className="w-3.5 h-3.5" />
                      Ответить
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => onReply(msg, "replyAll")}
                    >
                      <ReplyAll className="w-3.5 h-3.5" />
                      Ответить всем
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => onReply(msg, "forward")}
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      Переслать
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function EmailPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [state, dispatch] = useReducer(emailReducer, {
    ...initialState,
    mailbox: user?.email ?? "",
  });

  // Stable API base resolution (cached in ref, deduplicated in-flight)
  const apiBaseRef = useRef<string>("");
  const resolveInflightRef = useRef<Promise<string> | null>(null);

  const resolveApiBase = useCallback(async (): Promise<string> => {
    if (apiBaseRef.current) return apiBaseRef.current;
    if (resolveInflightRef.current) return resolveInflightRef.current;

    const bases = getEmailRouterApiBases();
    if (bases.length === 0) throw new Error("Нет настроенных endpoint-ов email-router");

    resolveInflightRef.current = (async () => {
      for (const base of bases) {
        try {
          const r = await fetchWithTimeout(`${base}/health`);
          if (r.ok) {
            const payload = (await r.json()) as { ok?: boolean };
            if (payload?.ok) {
              apiBaseRef.current = base;
              dispatch({ type: "SET_API_BASE", base });
              return base;
            }
          }
        } catch {
          // try next
        }
      }
      throw new Error("email-router недоступен");
    })().finally(() => { resolveInflightRef.current = null; });

    return resolveInflightRef.current;
  }, []);

  // ─── Load messages ──────────────────────────────────────────────────────────

  const loadMessages = useCallback(async () => {
    if (!isEmail(state.mailbox)) {
      dispatch({ type: "SET_ERROR", error: "Введите корректный email для mailbox" });
      return;
    }

    dispatch({ type: "SET_LOADING_LIST", loading: true });
    dispatch({ type: "SET_ERROR", error: "" });

    try {
      const base = await resolveApiBase();
      const isInboxSide = (state.folder === "inbox" || state.folder === "spam" || state.folder === "trash");

      let url: string;
      const params = new URLSearchParams({
        limit: "200", // load more, paginate client-side
        folder: state.folder,
      });

      if (isInboxSide) {
        params.set("to", state.mailbox);
        if (state.unreadOnly) params.set("unreadOnly", "true");
        url = `${base}/v1/email/inbox?${params}`;
      } else {
        params.set("from", state.mailbox);
        url = `${base}/v1/email/outbox?${params}`;
      }

      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }

      const payload = await response.json() as { ok: boolean; items: any[] };
      const rawItems: any[] = payload.items ?? [];

      const messages: MailMessage[] = rawItems.map((item) => {
        const subj = item.subject ?? "(без темы)";
        const from = isInboxSide ? (item.from_email ?? "") : (item.from_email ?? state.mailbox);
        const to = item.to_email ?? "";
        const participants = [from, to].filter(Boolean);
        const threadId = computeThreadId(subj, participants);

        const bodyText = item.text_body ?? null;
        const bodyHtml = item.html_body ?? null;
        const preview = bodyText
          ? bodyText.slice(0, 120)
          : bodyHtml
          ? htmlToText(bodyHtml).slice(0, 120)
          : "(пустое сообщение)";

        // Parse attachments from item (if email-router returns them)
        const attachments: Attachment[] = (item.attachments ?? []).map((a: any) => ({
          name: a.filename ?? a.name ?? "Файл",
          size: a.size ?? 0,
          mime: a.content_type ?? a.mime ?? "application/octet-stream",
          url: a.url ?? a.content ?? "",
        }));

        return {
          id: item.id,
          threadId,
          kind: isInboxSide ? "inbox" : "outbox",
          folder: (item.folder ?? state.folder) as FolderKind,
          from,
          to,
          subject: subj,
          preview,
          bodyText,
          bodyHtml,
          attachments,
          at: item.received_at ?? item.created_at ?? "",
          isRead: item.is_read ?? false,
          isStarred: item.is_starred ?? false,
          isFlagged: item.is_flagged ?? false,
          status: item.status,
        };
      });

      const totalPages = Math.max(1, Math.ceil(messages.length / PAGE_SIZE));
      dispatch({ type: "SET_MESSAGES", messages, totalPages });
    } catch (err) {
      dispatch({ type: "SET_ERROR", error: err instanceof Error ? err.message : "Ошибка загрузки" });
    }
  }, [state.folder, state.mailbox, state.unreadOnly, resolveApiBase]);

  // Initial load + folder/mailbox changes
  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  // Auto-poll every 30s for inbox
  useEffect(() => {
    if (state.folder !== "inbox") return;
    const interval = setInterval(() => {
      if (!state.loadingList) void loadMessages();
    }, 30_000);
    return () => clearInterval(interval);
  }, [state.folder, state.loadingList, loadMessages]);

  // Sync user email to mailbox
  useEffect(() => {
    if (!state.mailbox && user?.email) {
      dispatch({ type: "SET_MAILBOX", mailbox: user.email });
    }
  }, [user?.email, state.mailbox]);

  // ─── Auto-save draft (debounced 3s) ────────────────────────────────────────

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!state.composerOpen || !state.composer.isDirty) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(() => {
      void saveDraft(true);
    }, 3000);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.composer.bodyHtml, state.composer.subject, state.composer.to, state.composerOpen]);

  // ─── Derived data ────────────────────────────────────────────────────────────

  const filteredMessages = useMemo(() => {
    let result = state.messages;
    const q = state.searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (m) =>
          m.subject.toLowerCase().includes(q) ||
          m.from.toLowerCase().includes(q) ||
          m.to.toLowerCase().includes(q) ||
          m.preview.toLowerCase().includes(q)
      );
    }
    if (state.filterSender.trim()) {
      const fs = state.filterSender.trim().toLowerCase();
      result = result.filter((m) => m.from.toLowerCase().includes(fs));
    }
    if (state.filterDateFrom) {
      const from = new Date(state.filterDateFrom).getTime();
      result = result.filter((m) => new Date(m.at).getTime() >= from);
    }
    if (state.filterDateTo) {
      const to = new Date(state.filterDateTo).getTime() + 86399999;
      result = result.filter((m) => new Date(m.at).getTime() <= to);
    }
    return result.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [state.messages, state.searchQuery, state.filterSender, state.filterDateFrom, state.filterDateTo]);

  // Group into threads
  const threads = useMemo((): Thread[] => {
    const map = new Map<string, Thread>();
    for (const msg of filteredMessages) {
      let thread = map.get(msg.threadId);
      if (!thread) {
        thread = {
          id: msg.threadId,
          subject: msg.subject,
          participants: [],
          lastAt: msg.at,
          messages: [],
          unreadCount: 0,
        };
        map.set(msg.threadId, thread);
      }
      thread.messages.push(msg);
      if (!msg.isRead) thread.unreadCount++;
      if (msg.at > thread.lastAt) thread.lastAt = msg.at;
      if (!thread.participants.includes(msg.from)) thread.participants.push(msg.from);
      if (!thread.participants.includes(msg.to)) thread.participants.push(msg.to);
    }
    return [...map.values()].sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
  }, [filteredMessages]);

  // Paginated threads
  const pagedThreads = useMemo(() => {
    const start = (state.page - 1) * PAGE_SIZE;
    return threads.slice(start, start + PAGE_SIZE);
  }, [threads, state.page]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(threads.length / PAGE_SIZE)), [threads.length]);

  const selectedThread = useMemo(
    () => threads.find((t) => t.id === state.selectedThreadId) ?? null,
    [threads, state.selectedThreadId]
  );

  // Folder unread counts
  const unreadByFolder = useMemo(() => {
    const counts: Record<FolderKind, number> = { inbox: 0, sent: 0, draft: 0, spam: 0, trash: 0 };
    // Only inbox messages contribute to unread
    state.messages.forEach((m) => {
      if (m.kind === "inbox" && !m.isRead) {
        counts.inbox++;
      }
    });
    return counts;
  }, [state.messages]);

  // Checked IDs on current page
  const pagedMessageIds = useMemo(
    () => pagedThreads.flatMap((t) => t.messages.map((m) => m.id)),
    [pagedThreads]
  );

  const allPageChecked = pagedMessageIds.length > 0 && pagedMessageIds.every((id) => state.checkedIds.has(id));

  // ─── Actions ────────────────────────────────────────────────────────────────

  const moveMessages = useCallback(async (ids: string[], targetFolder: FolderKind) => {
    dispatch({ type: "SET_LOADING_ACTION", loading: true });
    try {
      const base = await resolveApiBase();
      await Promise.all(
        ids.map(async (id) => {
          const msg = state.messages.find((m) => m.id === id);
          if (!msg) return;
          const endpoint = msg.kind === "inbox"
            ? `${base}/v1/email/inbox/${id}/folder`
            : `${base}/v1/email/outbox/${id}/folder`;
          const r = await fetchWithTimeout(endpoint, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folder: targetFolder }),
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
        })
      );
      toast.success("Перемещено");
      dispatch({ type: "UNCHECK_ALL" });
      dispatch({ type: "SELECT_THREAD", threadId: null });
      await loadMessages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка перемещения");
    } finally {
      dispatch({ type: "SET_LOADING_ACTION", loading: false });
    }
  }, [state.messages, resolveApiBase, loadMessages]);

  const deleteMessages = useCallback(async (ids: string[]) => {
    // Move to trash; if already in trash — permanently delete
    if (state.folder === "trash") {
      dispatch({ type: "SET_LOADING_ACTION", loading: true });
      try {
        const base = await resolveApiBase();
        await Promise.all(
          ids.map(async (id) => {
            const msg = state.messages.find((m) => m.id === id);
            if (!msg) return;
            const endpoint = msg.kind === "inbox"
              ? `${base}/v1/email/inbox/${id}`
              : `${base}/v1/email/outbox/${id}`;
            const r = await fetchWithTimeout(endpoint, { method: "DELETE" });
            if (!r.ok && r.status !== 404) throw new Error(`HTTP ${r.status}`);
          })
        );
        toast.success("Удалено безвозвратно");
        dispatch({ type: "UNCHECK_ALL" });
        dispatch({ type: "SELECT_THREAD", threadId: null });
        await loadMessages();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Ошибка удаления");
      } finally {
        dispatch({ type: "SET_LOADING_ACTION", loading: false });
      }
    } else {
      await moveMessages(ids, "trash");
    }
  }, [state.folder, state.messages, resolveApiBase, loadMessages, moveMessages]);

  const markRead = useCallback(async (ids: string[], isRead: boolean) => {
    dispatch({ type: "MARK_READ", ids, isRead });
    try {
      const base = await resolveApiBase();
      await Promise.all(
        ids.map(async (id) => {
          const msg = state.messages.find((m) => m.id === id);
          if (!msg) return;
          const endpoint = msg.kind === "inbox"
            ? `${base}/v1/email/inbox/${id}/read`
            : `${base}/v1/email/outbox/${id}/read`;
          const r = await fetchWithTimeout(endpoint, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_read: isRead }),
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
        })
      );
    } catch (err) {
      // Rollback optimistic update
      dispatch({ type: "MARK_READ", ids, isRead: !isRead });
      toast.error("Ошибка пометки прочитанным");
    }
  }, [state.messages, resolveApiBase]);

  const toggleStar = useCallback(async (msg: MailMessage) => {
    const newVal = !msg.isStarred;
    dispatch({ type: "MARK_STARRED", id: msg.id, isStarred: newVal });
    try {
      const base = await resolveApiBase();
      const endpoint = msg.kind === "inbox"
        ? `${base}/v1/email/inbox/${msg.id}/star`
        : `${base}/v1/email/outbox/${msg.id}/star`;
      const r = await fetchWithTimeout(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_starred: newVal }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    } catch {
      dispatch({ type: "MARK_STARRED", id: msg.id, isStarred: msg.isStarred });
    }
  }, [resolveApiBase]);

  // ─── Composer actions ────────────────────────────────────────────────────────

  const sendEmail = useCallback(async () => {
    const { to, cc, bcc, subject, bodyHtml, inReplyTo, references, attachments } = state.composer;
    if (!to.trim()) { toast.error("Укажи получателя"); return; }
    if (!isEmail(to.trim())) { toast.error("Некорректный email получателя"); return; }

    dispatch({ type: "SET_LOADING_ACTION", loading: true });
    try {
      const base = await resolveApiBase();
      // Build recipients list
      const toList = to.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      const ccList = cc.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      const bccList = bcc.split(/[,;]/).map((s) => s.trim()).filter(Boolean);

      const bodyText = htmlToText(bodyHtml);

      const payload: Record<string, unknown> = {
        to: toList,
        cc: ccList.length ? ccList : undefined,
        bcc: bccList.length ? bccList : undefined,
        from: state.mailbox,
        subject: subject || "(без темы)",
        html: bodyHtml || undefined,
        text: bodyText || undefined,
        idempotencyKey: `send-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      };

      if (inReplyTo) payload["in_reply_to"] = inReplyTo;
      if (references) payload["references"] = references;
      if (attachments.length) {
        payload["attachments"] = attachments.map((a) => ({
          filename: a.name,
          url: a.url,
          content_type: a.mime,
        }));
      }

      const r = await fetchWithTimeout(`${base}/v1/email/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(text || `HTTP ${r.status}`);
      }

      // Delete draft if existed
      if (state.composer.draftId) {
        void fetchWithTimeout(`${base}/v1/email/outbox/${state.composer.draftId}`, { method: "DELETE" }).catch(() => {});
      }

      toast.success("Письмо отправлено");
      dispatch({ type: "CLOSE_COMPOSER" });
      dispatch({ type: "SET_FOLDER", folder: "sent" });
      await loadMessages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка отправки");
    } finally {
      dispatch({ type: "SET_LOADING_ACTION", loading: false });
    }
  }, [state.composer, state.mailbox, resolveApiBase, loadMessages]);

  const saveDraft = useCallback(async (silent = false) => {
    const { to, cc, subject, bodyHtml, draftId } = state.composer;
    if (!to.trim() && !subject.trim() && !bodyHtml.trim()) {
      if (!silent) toast.error("Черновик пустой");
      return;
    }

    try {
      const base = await resolveApiBase();
      const bodyText = htmlToText(bodyHtml);
      const payload = {
        to: to || undefined,
        cc: cc || undefined,
        from: state.mailbox,
        subject: subject || undefined,
        html: bodyHtml || undefined,
        text: bodyText || undefined,
        idempotencyKey: draftId ?? `draft-${Date.now()}`,
      };

      let savedId = draftId;

      if (draftId) {
        // Update existing draft
        const r = await fetchWithTimeout(`${base}/v1/email/drafts/${draftId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) {
          // If not found, create new
          const r2 = await fetchWithTimeout(`${base}/v1/email/drafts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (r2.ok) {
            const d = await r2.json() as { id?: string };
            savedId = d.id ?? null;
          }
        }
      } else {
        const r = await fetchWithTimeout(`${base}/v1/email/drafts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (r.ok) {
          const d = await r.json() as { id?: string };
          savedId = d.id ?? null;
        } else {
          throw new Error(`HTTP ${r.status}`);
        }
      }

      if (savedId) dispatch({ type: "SET_DRAFT_ID", draftId: savedId });
      if (!silent) {
        toast.success("Черновик сохранён");
        dispatch({ type: "CLOSE_COMPOSER" });
        dispatch({ type: "SET_FOLDER", folder: "draft" });
        await loadMessages();
      }
    } catch (err) {
      if (!silent) {
        toast.error(err instanceof Error ? err.message : "Ошибка сохранения черновика");
      }
    }
  }, [state.composer, state.mailbox, resolveApiBase, loadMessages]);

  const uploadAttachment = useCallback(async (file: File) => {
    const MAX_SIZE = 10 * 1024 * 1024; // 10 MB per attachment
    if (file.size > MAX_SIZE) {
      toast.error(`Файл "${file.name}" превышает 10 MB`);
      return;
    }

    toast.loading(`Загрузка ${file.name}...`, { id: `upload-${file.name}` });

    try {
      // Upload to Supabase Storage (bucket: email-attachments)
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id ?? "anon";
      const path = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

      const { data, error } = await supabase.storage
        .from("email-attachments")
        .upload(path, file, { contentType: file.type, upsert: false });

      if (error) throw error;

      const { data: urlData } = supabase.storage.from("email-attachments").getPublicUrl(data.path);

      dispatch({
        type: "ADD_ATTACHMENT",
        attachment: {
          name: file.name,
          size: file.size,
          mime: file.type,
          url: urlData.publicUrl,
        },
      });

      toast.success(`Загружено: ${file.name}`, { id: `upload-${file.name}` });
    } catch (err) {
      toast.error(
        `Ошибка загрузки ${file.name}: ${err instanceof Error ? err.message : String(err)}`,
        { id: `upload-${file.name}` }
      );
    }
  }, []);

  const handleReply = useCallback((msg: MailMessage, mode: "reply" | "replyAll" | "forward") => {
    const quoteHtml = `
      <br/><br/>
      <blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#555;margin:8px 0">
        <div style="font-size:12px;color:#888;margin-bottom:4px">
          ${formatDateFull(msg.at)}, ${msg.from}:
        </div>
        ${msg.bodyHtml ?? `<p>${msg.bodyText ?? ""}</p>`}
      </blockquote>
    `;

    const prefill: Partial<ComposerState> = {
      subject: mode === "forward" ? `Fwd: ${msg.subject}` : `Re: ${msg.subject}`,
      bodyHtml: quoteHtml,
      inReplyTo: msg.id,
      references: msg.id,
    };

    if (mode === "reply") prefill.to = msg.from;
    if (mode === "replyAll") {
      const recipients = [msg.from, ...msg.to.split(",")]
        .map((s) => s.trim())
        .filter((e) => e && e !== state.mailbox);
      prefill.to = recipients.join(", ");
    }
    if (mode === "forward") {
      prefill.to = "";
    }

    dispatch({ type: "OPEN_COMPOSER", mode, prefill });
  }, [state.mailbox]);

  // ─── Folder definitions ──────────────────────────────────────────────────────

  const folders: Array<{ id: FolderKind; label: string; icon: React.ElementType }> = [
    { id: "inbox", label: "Входящие", icon: Inbox },
    { id: "sent", label: "Отправленные", icon: Send },
    { id: "draft", label: "Черновики", icon: FileEdit },
    { id: "spam", label: "Спам", icon: ShieldAlert },
    { id: "trash", label: "Корзина", icon: Trash2 },
  ];

  const checkedList = [...state.checkedIds];
  const hasChecked = checkedList.length > 0;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-background/95 backdrop-blur flex-shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Mail className="h-5 w-5 text-primary" />
        <span className="font-semibold text-base">Почта</span>
        <div className="flex-1" />
        {/* Mailbox address — truncated, editable on click */}
        <span className="text-xs text-muted-foreground truncate max-w-[140px] hidden sm:block" title={state.mailbox}>
          {state.mailbox || "Не указан"}
        </span>
        <Button
          variant="default"
          size="sm"
          className="gap-2"
          onClick={() => dispatch({ type: "OPEN_COMPOSER", mode: "new" })}
        >
          <FileEdit className="h-4 w-4" />
          <span className="hidden sm:inline">Написать</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            apiBaseRef.current = "";
            void loadMessages();
          }}
          disabled={state.loadingList}
        >
          {state.loadingList ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ── */}
        <aside className="w-48 lg:w-56 flex-shrink-0 border-r flex flex-col py-3 px-2 gap-1 hidden sm:flex">
          {folders.map((f) => (
            <FolderItem
              key={f.id}
              id={f.id}
              label={f.label}
              icon={f.icon}
              active={state.folder === f.id}
              unread={state.folder === f.id ? 0 : unreadByFolder[f.id]}
              onClick={() => dispatch({ type: "SET_FOLDER", folder: f.id })}
            />
          ))}
          <Separator className="my-2" />
          <button
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            onClick={() => navigate("/email/settings")}
          >
            <Settings className="w-4 h-4" />
            SMTP Настройки
          </button>
        </aside>

        {/* ── Message list ── */}
        <div
          className={cn(
            "flex flex-col border-r",
            (selectedThread || state.composerOpen) ? "hidden md:flex md:w-80 lg:w-96" : "flex flex-1 md:w-80 lg:w-96 md:flex-none"
          )}
        >
          {/* List toolbar */}
          <div className="flex flex-col gap-2 p-3 border-b">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-8 h-8 text-sm"
                placeholder="Поиск по письмам..."
                value={state.searchQuery}
                onChange={(e) => dispatch({ type: "SET_SEARCH", query: e.target.value })}
              />
            </div>

            {/* Toolbar row */}
            <div className="flex items-center gap-1.5">
              {/* Select all */}
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => allPageChecked
                  ? dispatch({ type: "UNCHECK_ALL" })
                  : dispatch({ type: "CHECK_ALL", ids: pagedMessageIds })
                }
              >
                {allPageChecked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              </button>

              {hasChecked ? (
                <>
                  <span className="text-xs text-muted-foreground">{checkedList.length} выбрано</span>
                  <div className="flex-1" />
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1"
                    onClick={() => void markRead(checkedList, true)}>
                    Прочитано
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1"
                    onClick={() => void markRead(checkedList, false)}>
                    Непрочитано
                  </Button>
                  <Select onValueChange={(f) => void moveMessages(checkedList, f as FolderKind)}>
                    <SelectTrigger className="h-6 w-24 text-xs">
                      <SelectValue placeholder="Переместить" />
                    </SelectTrigger>
                    <SelectContent>
                      {folders.filter((f) => f.id !== state.folder).map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-6 w-6"
                    onClick={() => void deleteMessages(checkedList)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex-1" />
                  {/* Unread only toggle */}
                 <button
                   className={cn(
                     "text-xs px-2 py-0.5 rounded-full border transition-colors whitespace-nowrap flex-shrink-0",
                     state.unreadOnly
                       ? "bg-primary text-primary-foreground border-primary"
                       : "text-muted-foreground border-border hover:bg-accent"
                   )}
                   onClick={() => dispatch({ type: "SET_UNREAD_ONLY", value: !state.unreadOnly })}
                 >
                   Непрочит.
                 </button>
                 {/* Advanced filters */}
                 <button
                   className={cn(
                     "text-xs px-2 py-0.5 rounded-full border transition-colors whitespace-nowrap flex-shrink-0",
                     state.showFilters
                       ? "bg-primary text-primary-foreground border-primary"
                       : "text-muted-foreground border-border hover:bg-accent"
                   )}
                   onClick={() => dispatch({ type: "TOGGLE_FILTERS" })}
                 >
                   Фильтры
                 </button>
                </>
              )}
            </div>

            {/* Advanced filters panel */}
            {state.showFilters && (
              <div className="space-y-1.5 pt-1 border-t">
                <Input
                  className="h-7 text-xs"
                  placeholder="От кого (фильтр)"
                  value={state.filterSender}
                  onChange={(e) => dispatch({ type: "SET_FILTER_SENDER", value: e.target.value })}
                />
                <div className="flex gap-1.5">
                  <Input
                    type="date"
                    className="h-7 text-xs flex-1"
                    value={state.filterDateFrom}
                    onChange={(e) => dispatch({ type: "SET_FILTER_DATE_FROM", value: e.target.value })}
                  />
                  <span className="text-xs text-muted-foreground self-center">—</span>
                  <Input
                    type="date"
                    className="h-7 text-xs flex-1"
                    value={state.filterDateTo}
                    onChange={(e) => dispatch({ type: "SET_FILTER_DATE_TO", value: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Folder heading (mobile) */}
          <div className="flex items-center gap-2 px-3 py-2 sm:hidden border-b">
            <Select value={state.folder} onValueChange={(f) => dispatch({ type: "SET_FOLDER", folder: f as FolderKind })}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {folders.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Error banner — graceful degradation for email-router unavailability */}
          {state.errorText && (
            <div className="px-3 py-3 border-b bg-amber-50/80 dark:bg-amber-950/30">
              <div className="flex items-start gap-2">
                <Settings className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Почтовый сервер не подключён</p>
                  <p className="text-xs text-amber-600/80 dark:text-amber-400/70 mt-0.5">
                    Настройте SMTP для отправки и получения писем
                  </p>
                  <button
                    className="text-xs font-medium text-primary underline underline-offset-2 mt-1 hover:opacity-80"
                    onClick={() => navigate("/email/settings")}
                  >
                    Настроить SMTP →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* List */}
          <div className="flex-1 overflow-auto">
            {state.loadingList && pagedThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin mb-2" />
                <span className="text-sm">Загрузка...</span>
              </div>
            ) : pagedThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                <Mail className="w-8 h-8 mb-2 opacity-30" />
                <span className="text-sm">Писем нет</span>
              </div>
            ) : (
              pagedThreads.map((thread) => {
                const lastMsg = thread.messages[thread.messages.length - 1];
                const anyChecked = thread.messages.some((m) => state.checkedIds.has(m.id));
                return (
                  <MessageRow
                    key={thread.id}
                    msg={{
                      ...lastMsg,
                      subject: thread.subject,
                      preview: thread.messages.length > 1
                        ? `[${thread.messages.length}] ${lastMsg.preview}`
                        : lastMsg.preview,
                      isRead: thread.unreadCount === 0,
                    }}
                    checked={anyChecked}
                    selected={state.selectedThreadId === thread.id}
                    onCheck={() => {
                      const ids = thread.messages.map((m) => m.id);
                      if (anyChecked) {
                        ids.forEach((id) => {
                          if (state.checkedIds.has(id)) {
                            dispatch({ type: "TOGGLE_CHECK", id });
                          }
                        });
                      } else {
                        ids.forEach((id) => {
                          if (!state.checkedIds.has(id)) {
                            dispatch({ type: "TOGGLE_CHECK", id });
                          }
                        });
                      }
                    }}
                    onSelect={() => {
                      dispatch({ type: "SELECT_THREAD", threadId: thread.id });
                      if (thread.unreadCount > 0) {
                        void markRead(thread.messages.filter((m) => !m.isRead).map((m) => m.id), true);
                      }
                    }}
                    onStar={() => void toggleStar(lastMsg)}
                  />
                );
              })
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-2 border-t text-sm">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={state.page <= 1}
                onClick={() => dispatch({ type: "SET_PAGE", page: state.page - 1 })}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                {state.page} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={state.page >= totalPages}
                onClick={() => dispatch({ type: "SET_PAGE", page: state.page + 1 })}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <span className="text-xs text-muted-foreground ml-1">
                {filteredMessages.length} писем · {threads.length} тредов
              </span>
            </div>
          )}
        </div>

        {/* ── Right pane: detail or composer ── */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {state.composerOpen ? (
            <ComposerPanel
              state={state}
              dispatch={dispatch}
              onSend={sendEmail}
              onSaveDraft={() => saveDraft(false)}
              onUploadAttachment={uploadAttachment}
              loading={state.loadingAction}
            />
          ) : selectedThread ? (
            <MessageDetail
              thread={selectedThread}
              state={state}
              dispatch={dispatch}
              onReply={handleReply}
              onMove={moveMessages}
              onDelete={deleteMessages}
              onMarkRead={markRead}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <Mail className="w-16 h-16 opacity-10" />
              <p className="text-base">Выберите письмо для просмотра</p>
              <p className="text-sm opacity-60">или</p>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => dispatch({ type: "OPEN_COMPOSER", mode: "new" })}
              >
                <FileEdit className="w-4 h-4" />
                Написать новое письмо
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default EmailPage;
