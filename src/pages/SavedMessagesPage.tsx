import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bookmark, Search, X, Trash2, Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSavedMessages, SavedMessage } from "@/hooks/useSavedMessages";
import { GradientAvatar } from "@/components/ui/gradient-avatar";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

// ─── SavedMessageBubble ───────────────────────────────────────────────────────

interface SavedMessageBubbleProps {
  message: SavedMessage;
  onDelete: (id: string) => void;
  currentUserId: string;
}

function SavedMessageBubble({ message, onDelete, currentUserId }: SavedMessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);

  const formatTime = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ru });
    } catch (_err) {
      return "";
    }
  };

  const isSelf = !message.sender_name;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex flex-col items-end gap-1 px-4 py-1"
      onContextMenu={(e) => {
        e.preventDefault();
        setShowActions((p) => !p);
      }}
    >
      {/* Original sender attribution (if forwarded from another chat) */}
      {message.sender_name && (
        <div className="flex items-center gap-2 self-end mr-1">
          {message.sender_avatar ? (
            <img
              src={message.sender_avatar}
              className="w-4 h-4 rounded-full object-cover"
              alt={message.sender_name}
            />
          ) : (
            <GradientAvatar
              name={message.sender_name}
              seed={message.original_message_id ?? message.id}
              size="sm"
            />
          )}
          <span className="text-xs text-muted-foreground dark:text-white/50">
            {message.sender_name}
          </span>
        </div>
      )}

      {/* Bubble */}
      <div
        className={cn(
          "max-w-[80%] rounded-2xl rounded-br-sm px-3 py-2 shadow-sm",
          "bg-[#2b5278] text-white"
        )}
        onClick={() => setShowActions((p) => !p)}
      >
        {/* Media */}
        {message.media_url && message.media_type?.startsWith("image") && (
          <img
            src={message.media_url}
            alt="media"
            className="rounded-lg mb-1 max-w-full max-h-60 object-cover"
          />
        )}
        {message.media_url && message.media_type?.startsWith("video") && (
          <video
            src={message.media_url}
            controls
            className="rounded-lg mb-1 max-w-full max-h-60"
          />
        )}

        {/* Content */}
        {message.content && (
          <p className="text-[15px] leading-[1.4] whitespace-pre-wrap break-words">
            {message.content}
          </p>
        )}

        {/* Time */}
        <p className="text-[11px] text-white/50 text-right mt-0.5">
          {formatTime(message.saved_at)}
        </p>
      </div>

      {/* Action bar */}
      <AnimatePresence>
        {showActions && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex items-center gap-2"
          >
            <button
              onClick={() => {
                onDelete(message.id);
                setShowActions(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/20 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Удалить
            </button>
            <button
              onClick={() => setShowActions(false)}
              className="flex items-center gap-1 px-2 py-1.5 rounded-full bg-muted text-muted-foreground text-sm hover:bg-muted/80 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── SavedMessagesPage ────────────────────────────────────────────────────────

export function SavedMessagesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    messages,
    loading,
    error,
    hasMore,
    loadMore,
    saveMessage,
    removeSavedMessage,
    refetch,
  } = useSavedMessages({ pageSize: 40 });

  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // ── Infinite scroll via IntersectionObserver ──────────────────────────────

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          void loadMore();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  // ── Auto-scroll to bottom on new messages ─────────────────────────────────

  useEffect(() => {
    if (!listRef.current) return;
    // Scroll to bottom only if near bottom
    const el = listRef.current;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (isNearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length]);

  // ── Filtered messages ─────────────────────────────────────────────────────

  const filteredMessages = searchQuery.trim()
    ? messages.filter((m) =>
        m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.sender_name || "").toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  // Show in chronological order (oldest first for chat-style display)
  const displayMessages = [...filteredMessages].reverse();

  // ── Send message to self ──────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || sending) return;

    setSending(true);
    try {
      await saveMessage({ content: text });
      setInputValue("");
    } finally {
      setSending(false);
    }
  }, [inputValue, sending, saveMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  // ── Auto-resize textarea ──────────────────────────────────────────────────

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = "auto";
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
  }, [inputValue]);

  return (
    <div className="flex flex-col h-screen bg-background dark:bg-[#0e1621] overflow-hidden">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60 dark:border-white/10 bg-background/90 dark:bg-[#17212b]/90 backdrop-blur-xl flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted dark:hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-foreground dark:text-white" />
        </button>

        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center flex-shrink-0">
            <Bookmark className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="font-semibold text-foreground dark:text-white truncate">
              Избранное
            </h1>
            <p className="text-xs text-muted-foreground dark:text-white/50">
              {messages.length > 0
                ? `${messages.length} сообщений`
                : "Сохраняйте сообщения здесь"}
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setSearchOpen((p) => !p);
            if (!searchOpen) {
              setSearchQuery("");
            }
          }}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted dark:hover:bg-white/10 transition-colors"
        >
          {searchOpen ? (
            <X className="w-5 h-5 text-foreground dark:text-white" />
          ) : (
            <Search className="w-5 h-5 text-foreground dark:text-white" />
          )}
        </button>
      </div>

      {/* ── Search bar ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden flex-shrink-0 border-b border-border/60 dark:border-white/10"
          >
            <div className="px-4 py-2">
              <div className="flex items-center gap-2 bg-muted dark:bg-white/10 rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-muted-foreground dark:text-white/40 flex-shrink-0" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Поиск в избранном..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-foreground dark:text-white placeholder:text-muted-foreground dark:placeholder:text-white/40 outline-none"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")}>
                    <X className="w-4 h-4 text-muted-foreground dark:text-white/40" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Message list ──────────────────────────────────────────────────── */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto overscroll-contain py-2"
      >
        {/* Load more sentinel (top of list) */}
        <div ref={sentinelRef} className="h-1" />

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-muted-foreground/40 dark:border-white/30" />
          </div>
        )}

        {error && (
          <div className="mx-4 my-4 rounded-2xl bg-destructive/10 border border-destructive/20 p-4">
            <p className="text-sm text-destructive">{error}</p>
            <button
              onClick={() => void refetch()}
              className="mt-2 text-xs text-destructive/80 underline"
            >
              Повторить
            </button>
          </div>
        )}

        {!loading && !error && displayMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full py-20 px-8 text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-400/20 border border-blue-500/30 flex items-center justify-center mb-4">
              <Bookmark className="w-10 h-10 text-blue-500/60" />
            </div>
            <h3 className="font-semibold text-foreground dark:text-white mb-2">
              {searchQuery ? "Ничего не найдено" : "Нет сохранённых сообщений"}
            </h3>
            <p className="text-sm text-muted-foreground dark:text-white/50">
              {searchQuery
                ? "Попробуйте другой запрос"
                : "Сохраняйте сообщения из любого чата через контекстное меню или отправляйте заметки себе"}
            </p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {displayMessages.map((msg) => (
            <SavedMessageBubble
              key={msg.id}
              message={msg}
              currentUserId={user?.id ?? ""}
              onDelete={removeSavedMessage}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* ── Input area ────────────────────────────────────────────────────── */}
      {!searchOpen && (
        <div className="flex-shrink-0 border-t border-border/60 dark:border-white/10 bg-background/90 dark:bg-[#17212b]/90 backdrop-blur-xl px-3 py-2">
          <div className="flex items-end gap-2">
            <div className="flex-1 bg-muted dark:bg-white/10 rounded-2xl px-4 py-2 flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Заметка для себя..."
                rows={1}
                className="flex-1 bg-transparent text-sm text-foreground dark:text-white placeholder:text-muted-foreground dark:placeholder:text-white/40 outline-none resize-none max-h-30 leading-5"
                style={{ minHeight: "20px" }}
              />
            </div>
            <button
              onClick={() => void handleSend()}
              disabled={!inputValue.trim() || sending}
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0",
                inputValue.trim() && !sending
                  ? "bg-blue-500 hover:bg-blue-600 text-white shadow-md"
                  : "bg-muted dark:bg-white/10 text-muted-foreground dark:text-white/30"
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SavedMessagesPage;
