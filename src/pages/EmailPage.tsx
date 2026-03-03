import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Mail, RefreshCw, Send, FileEdit, Inbox, Trash2, ShieldAlert, ArchiveRestore } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { getEmailRouterApiBases } from "@/lib/email/backendEndpoints";

type InboxFolder = "inbox" | "spam" | "trash";
type OutboxFolder = "sent" | "draft" | "trash";
type MailFolder = InboxFolder | OutboxFolder;

type EmailThread = {
  id: string;
  mailbox_email: string;
  subject_normalized: string | null;
  last_message_at: string;
};

type InboxMessage = {
  id: string;
  from_email: string;
  to_email: string;
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
  received_at: string;
};

type OutboxMessage = {
  id: string;
  from_email: string | null;
  to_email: string;
  folder: OutboxFolder;
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
  status: "pending" | "processing" | "sent" | "failed" | "draft";
  created_at: string;
};

type InboxMessageListResponse = {
  ok: boolean;
  items: InboxMessage[];
};

type OutboxMessageListResponse = {
  ok: boolean;
  items: OutboxMessage[];
};

type ThreadsResponse = {
  ok: boolean;
  items: EmailThread[];
};

type ConversationItem = {
  id: string;
  kind: "inbox" | "outbox";
  at: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  sourceFolder: MailFolder;
  status?: string;
};

const REQUEST_TIMEOUT_MS = 8000;

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function getBodyPreview(text: string | null | undefined, html: string | null | undefined): string {
  if (text && text.trim()) return text.trim();
  if (html && html.trim()) {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return "(пустое сообщение)";
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function resolveApiBase(): Promise<string> {
  const bases = getEmailRouterApiBases();
  let lastError = "email-router недоступен";

  for (const base of bases) {
    try {
      const response = await fetchWithTimeout(`${base}/health`);
      if (!response.ok) {
        lastError = `health check ${response.status}`;
        continue;
      }

      const payload = (await response.json()) as { ok?: boolean };
      if (payload?.ok) {
        return base;
      }
      lastError = "health check вернул не-ok";
    } catch (error) {
      lastError = error instanceof Error ? error.message : "network error";
    }
  }

  throw new Error(lastError);
}

export function EmailPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mailbox, setMailbox] = useState(user?.email ?? "");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [folder, setFolder] = useState<MailFolder>("inbox");
  const [search, setSearch] = useState("");
  const [apiBase, setApiBase] = useState("");
  const [threads, setThreads] = useState<ConversationItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeText, setComposeText] = useState("");
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    if (!mailbox && user?.email) {
      setMailbox(user.email);
    }
  }, [mailbox, user?.email]);

  const canLoad = useMemo(() => isEmail(mailbox), [mailbox]);

  const selectedItem = useMemo(
    () => threads.find((item) => item.id === selectedItemId) ?? null,
    [threads, selectedItemId],
  );

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return threads;
    return threads.filter((item) => {
      return (
        item.subject.toLowerCase().includes(query) ||
        item.from.toLowerCase().includes(query) ||
        item.to.toLowerCase().includes(query) ||
        item.body.toLowerCase().includes(query)
      );
    });
  }, [search, threads]);

  const resolveCurrentApiBase = useCallback(async (): Promise<string> => {
    if (apiBase) return apiBase;
    const base = await resolveApiBase();
    setApiBase(base);
    return base;
  }, [apiBase]);

  const loadThreads = useCallback(async () => {
    if (!isEmail(mailbox)) {
      setErrorText("Введите корректный email для mailbox");
      return;
    }

    setLoadingList(true);
    setErrorText("");

    try {
      const base = await resolveCurrentApiBase();
      setApiBase(base);

      if (folder === "inbox" || folder === "spam" || folder === "trash") {
        const params = new URLSearchParams({
          to: mailbox,
          limit: "100",
          folder,
          unreadOnly: unreadOnly ? "true" : "false",
        });

        const response = await fetchWithTimeout(`${base}/v1/email/inbox?${params.toString()}`);
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `HTTP ${response.status}`);
        }
        const payload = (await response.json()) as InboxMessageListResponse;
        const mapped: ConversationItem[] = (payload.items ?? []).map((item) => ({
          id: item.id,
          kind: "inbox",
          at: item.received_at,
          from: item.from_email,
          to: item.to_email,
          subject: item.subject ?? "(без темы)",
          body: getBodyPreview(item.text_body, item.html_body),
          sourceFolder: folder,
        }));
        setThreads(mapped);
      } else {
        const params = new URLSearchParams({
          from: mailbox,
          limit: "100",
          folder,
        });

        const response = await fetchWithTimeout(`${base}/v1/email/outbox?${params.toString()}`);
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `HTTP ${response.status}`);
        }
        const payload = (await response.json()) as OutboxMessageListResponse;
        const mapped: ConversationItem[] = (payload.items ?? []).map((item) => ({
          id: item.id,
          kind: "outbox",
          at: item.created_at,
          from: item.from_email ?? "noreply",
          to: item.to_email,
          subject: item.subject ?? "(без темы)",
          body: getBodyPreview(item.text_body, item.html_body),
          sourceFolder: item.folder,
          status: item.status,
        }));
        setThreads(mapped);
      }

      setSelectedItemId((prev) => {
        if (prev && threads.some((x) => x.id === prev)) return prev;
        return null;
      });
    } catch (error) {
      setThreads([]);
      setSelectedItemId(null);
      setErrorText(error instanceof Error ? error.message : "Не удалось загрузить треды");
    } finally {
      setLoadingList(false);
    }
  }, [folder, mailbox, resolveCurrentApiBase, unreadOnly, threads]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const moveSelected = useCallback(
    async (targetFolder: MailFolder) => {
      if (!selectedItem) return;
      setLoadingAction(true);
      setErrorText("");
      try {
        const base = await resolveCurrentApiBase();
        const isInbox = selectedItem.kind === "inbox";
        const endpoint = isInbox
          ? `${base}/v1/email/inbox/${selectedItem.id}/folder`
          : `${base}/v1/email/outbox/${selectedItem.id}/folder`;
        const response = await fetchWithTimeout(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folder: targetFolder }),
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `HTTP ${response.status}`);
        }
        toast.success("Письмо перемещено");
        setSelectedItemId(null);
        await loadThreads();
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : "Не удалось переместить письмо");
      } finally {
        setLoadingAction(false);
      }
    },
    [loadThreads, resolveCurrentApiBase, selectedItem],
  );

  const sendNow = useCallback(async () => {
    if (!composeTo || !isEmail(composeTo)) {
      toast.error("Укажи корректный email получателя");
      return;
    }
    if (!composeSubject.trim() && !composeText.trim()) {
      toast.error("Добавь тему или текст письма");
      return;
    }

    setLoadingAction(true);
    setErrorText("");
    try {
      const base = await resolveCurrentApiBase();
      const response = await fetchWithTimeout(`${base}/v1/email/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: composeTo,
          from: mailbox,
          subject: composeSubject || "(без темы)",
          text: composeText,
          idempotencyKey: `send-${Date.now()}`,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      toast.success("Письмо поставлено в отправку");
      setComposerOpen(false);
      setComposeTo("");
      setComposeSubject("");
      setComposeText("");
      setFolder("sent");
      await loadThreads();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Не удалось отправить письмо");
    } finally {
      setLoadingAction(false);
    }
  }, [composeSubject, composeText, composeTo, loadThreads, mailbox, resolveCurrentApiBase]);

  const saveDraft = useCallback(async () => {
    if (!composeSubject.trim() && !composeText.trim() && !composeTo.trim()) {
      toast.error("Черновик пустой");
      return;
    }

    setLoadingAction(true);
    setErrorText("");
    try {
      const base = await resolveCurrentApiBase();
      const response = await fetchWithTimeout(`${base}/v1/email/drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: composeTo || undefined,
          from: mailbox,
          subject: composeSubject || undefined,
          text: composeText || undefined,
          idempotencyKey: `draft-${Date.now()}`,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      toast.success("Черновик сохранён");
      setComposerOpen(false);
      setComposeTo("");
      setComposeSubject("");
      setComposeText("");
      setFolder("draft");
      await loadThreads();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Не удалось сохранить черновик");
    } finally {
      setLoadingAction(false);
    }
  }, [composeSubject, composeText, composeTo, loadThreads, mailbox, resolveCurrentApiBase]);

  const folders: Array<{ id: MailFolder; label: string; icon: React.ElementType }> = [
    { id: "inbox", label: "Входящие", icon: Inbox },
    { id: "sent", label: "Исходящие", icon: Send },
    { id: "draft", label: "Черновики", icon: FileEdit },
    { id: "spam", label: "Спам", icon: ShieldAlert },
    { id: "trash", label: "Корзина", icon: Trash2 },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-6xl p-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Почта</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setComposerOpen((v) => !v)}>
              <Mail className="h-4 w-4" />
              Новое
            </Button>
            <Button variant="outline" size="sm" onClick={() => void loadThreads()} disabled={loadingList || !canLoad}>
              {loadingList ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Обновить
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl p-4 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Mailbox</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="email"
              value={mailbox}
              onChange={(e) => setMailbox(e.target.value.trim())}
              placeholder="support@example.com"
            />
            <div className="flex items-center justify-between rounded-md border p-2">
              <span className="text-sm text-muted-foreground">Только непрочитанные</span>
              <Switch checked={unreadOnly} onCheckedChange={setUnreadOnly} />
            </div>

            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по письмам"
            />

            <div className="grid grid-cols-2 gap-2">
              {folders.map((item) => {
                const Icon = item.icon;
                const active = folder === item.id;
                return (
                  <Button
                    key={item.id}
                    variant={active ? "default" : "outline"}
                    className="justify-start"
                    onClick={() => setFolder(item.id)}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                );
              })}
            </div>

            {composerOpen ? (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-sm font-medium">Новое письмо</p>
                <Input placeholder="Кому" value={composeTo} onChange={(e) => setComposeTo(e.target.value)} />
                <Input placeholder="Тема" value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} />
                <Textarea placeholder="Текст письма" value={composeText} onChange={(e) => setComposeText(e.target.value)} rows={5} />
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => void sendNow()} disabled={loadingAction}>
                    <Send className="h-4 w-4" />
                    Отправить
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void saveDraft()} disabled={loadingAction}>
                    <FileEdit className="h-4 w-4" />
                    В черновики
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="space-y-2 max-h-[58vh] overflow-auto">
              {filteredItems.map((item) => {
                const active = item.id === selectedItemId;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSelectedItemId(item.id);
                    }}
                    className={`w-full text-left rounded-lg border p-3 transition-colors ${
                      active ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                    }`}
                  >
                    <p className="text-sm font-medium truncate">{item.subject}</p>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{item.kind === "inbox" ? item.from : item.to}</p>
                    <p className="text-xs text-muted-foreground mt-1">{formatDateTime(item.at)}</p>
                  </button>
                );
              })}

              {!loadingList && filteredItems.length === 0 && (
                <div className="text-sm text-muted-foreground border rounded-lg p-3">Писем не найдено</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {selectedItem ? "Просмотр письма" : "Выберите письмо"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {errorText ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {errorText}
              </div>
            ) : null}

            {apiBase ? (
              <p className="text-xs text-muted-foreground mb-3">API: {apiBase}</p>
            ) : null}

            {loadingAction ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Выполняется операция...
              </div>
            ) : (
              <div className="space-y-3">
                {selectedItem ? (
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {selectedItem.kind === "inbox" ? "Входящее" : "Исходящее"}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(selectedItem.at)}</span>
                    </div>
                    <p className="text-sm font-medium mt-1">{selectedItem.subject}</p>
                    <p className="text-xs text-muted-foreground mt-1">{selectedItem.from} → {selectedItem.to}</p>
                    {selectedItem.status ? (
                      <p className="text-xs text-muted-foreground mt-1">Статус: {selectedItem.status}</p>
                    ) : null}
                    <p className="text-sm mt-2 whitespace-pre-wrap break-words">{selectedItem.body}</p>

                    <div className="flex flex-wrap gap-2 mt-4">
                      {selectedItem.kind === "inbox" ? (
                        <>
                          {selectedItem.sourceFolder !== "inbox" ? (
                            <Button size="sm" variant="outline" onClick={() => void moveSelected("inbox")}> 
                              <ArchiveRestore className="h-4 w-4" />
                              Во входящие
                            </Button>
                          ) : null}
                          {selectedItem.sourceFolder !== "spam" ? (
                            <Button size="sm" variant="outline" onClick={() => void moveSelected("spam")}> 
                              <ShieldAlert className="h-4 w-4" />
                              В спам
                            </Button>
                          ) : null}
                          {selectedItem.sourceFolder !== "trash" ? (
                            <Button size="sm" variant="outline" onClick={() => void moveSelected("trash")}> 
                              <Trash2 className="h-4 w-4" />
                              В корзину
                            </Button>
                          ) : null}
                        </>
                      ) : (
                        <>
                          {selectedItem.sourceFolder !== "sent" ? (
                            <Button size="sm" variant="outline" onClick={() => void moveSelected("sent")}> 
                              <Send className="h-4 w-4" />
                              В исходящие
                            </Button>
                          ) : null}
                          {selectedItem.sourceFolder !== "draft" ? (
                            <Button size="sm" variant="outline" onClick={() => void moveSelected("draft")}> 
                              <FileEdit className="h-4 w-4" />
                              В черновики
                            </Button>
                          ) : null}
                          {selectedItem.sourceFolder !== "trash" ? (
                            <Button size="sm" variant="outline" onClick={() => void moveSelected("trash")}> 
                              <Trash2 className="h-4 w-4" />
                              В корзину
                            </Button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground border rounded-lg p-3">Выберите письмо слева</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default EmailPage;
