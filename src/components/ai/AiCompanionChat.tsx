import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, ChevronLeft, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Role = "user" | "assistant";

type Message = {
  role: Role;
  content: string;
};

type TextPart = { kind: "text"; text: string };
type CodePart = { kind: "code"; lang: string; code: string };
type ContentPart = TextPart | CodePart;

const STORAGE_KEY = "ai_companion_messages_v1";
const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-companion`;

const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string;

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Скопировано");
  } catch {
    toast.error("Не удалось скопировать");
  }
}

function splitByFencedBlocks(content: string): ContentPart[] {
  // Supports ```lang\n...\n```
  const parts: ContentPart[] = [];
  const re = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)\n```/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const idx = m.index;
    if (idx > lastIndex) {
      const text = content.slice(lastIndex, idx);
      if (text) parts.push({ kind: "text", text });
    }
    const lang = (m[1] || "").trim().toLowerCase();
    const code = (m[2] || "").replace(/\s+$/, "");
    parts.push({ kind: "code", lang, code });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex);
    if (text) parts.push({ kind: "text", text });
  }
  return parts;
}

function toCopilotPrompt(latestAssistantMessage: string): string {
  return [
    "Сделай изменения в текущем репозитории в VS Code (Copilot).",
    "Если есть патч/команды ниже — примени их и запусти проверки.",
    "Ответь кратким отчётом что изменилось и где.",
    "",
    latestAssistantMessage.trim(),
  ].join("\n");
}

function safeParseStoredMessages(raw: string | null): Message[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m) => m && typeof m === "object")
      .map((m: any) => ({ role: m.role, content: m.content }))
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string");
  } catch {
    return [];
  }
}

interface AiCompanionChatProps {
  onClose?: () => void;
  className?: string;
}

export function AiCompanionChat({ onClose, className }: AiCompanionChatProps) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>(() => safeParseStoredMessages(localStorage.getItem(STORAGE_KEY)));
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPrTask, setPendingPrTask] = useState<string>("");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const canSend = useMemo(() => input.trim().length > 0 && !isLoading, [input, isLoading]);

  const latestUserText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.role === "user" && m.content.trim()) return m.content.trim();
    }
    return "";
  }, [messages]);

  const canCreatePr = useMemo(() => {
    return !isLoading && (input.trim().length > 0 || latestUserText.length > 0);
  }, [input, isLoading, latestUserText]);

  const createPr = async () => {
    if (!canCreatePr) return;
    const task = pendingPrTask.slice(0, 2000);
    if (!task.trim()) {
      toast.error("Нет текста задачи для PR");
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke("ai-dispatch-pr", {
        body: { task },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Dispatch failed");
      toast.success("PR запущен в GitHub Actions");
      if (data.actions_url) {
        void copyToClipboard(String(data.actions_url));
      }
    } catch (e) {
      console.error("createPr error:", e);
      toast.error(e instanceof Error ? e.message : "Не удалось запустить PR");
    }
  };

  const requestCreatePr = () => {
    if (!canCreatePr) return;
    const task = (input.trim().length > 0 ? input.trim() : latestUserText).slice(0, 2000);
    if (!task.trim()) {
      toast.error("Напиши задачу (или выбери последнюю)" );
      return;
    }
    setPendingPrTask(task);
    setConfirmOpen(true);
  };

  const streamChat = async (userMessage: string) => {
    const userMsg: Message = { role: "user", content: userMessage };
    const newMessages = [...messages, userMsg];

    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(errorData.error || "Ошибка");
      }

      if (!resp.body) throw new Error("No response");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let assistantContent = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":" ) || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: "assistant", content: assistantContent };
                return next;
              });
            }
          } catch {
            // wait for more data
          }
        }
      }
    } catch (error) {
      console.error("AI chat error:", error);
      toast.error(error instanceof Error ? error.message : "Ошибка");
      setMessages((prev) => prev.filter((m) => m.content !== ""));
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    void streamChat(input.trim());
  };

  const handleBack = () => {
    if (onClose) {
      onClose();
      return;
    }
    navigate("/chats");
  };

  return (
    <div className={cn("h-full flex flex-col bg-background", className)}>
      <div className="h-14 flex items-center gap-2 px-3 border-b">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={handleBack}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
            <Bot className="w-5 h-5 text-foreground" />
          </div>
          <div className="min-w-0">
            <div className="font-medium leading-5 truncate">AI помощник</div>
            <div className="text-xs text-muted-foreground leading-4 truncate">Команды по коду и вопросы</div>
          </div>
        </div>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          disabled={!canCreatePr}
          onClick={requestCreatePr}
        >
          Создать PR
        </Button>
        <Button variant="ghost" size="sm" disabled={messages.length === 0} onClick={() => setMessages([])}>
          Очистить
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Создать PR?</AlertDialogTitle>
            <AlertDialogDescription>
              Запущу GitHub Actions, он внесёт изменения, прогонит тесты и откроет PR.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words max-h-40 overflow-auto rounded-md border p-2">
            {pendingPrTask}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                void createPr();
              }}
            >
              Подтвердить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Напиши задачу (например: “почини /auth на GitHub Pages” или “добавь кнопку в чат”).
            </div>
          ) : null}

          {messages.map((m, idx) => {
            const isUser = m.role === "user";
            const parts = !isUser ? splitByFencedBlocks(m.content) : null;
            return (
              <div key={idx} className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
                {!isUser && (
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                )}
                <div className={cn("max-w-[85%] min-w-0")}> 
                  <div
                    className={cn(
                      "rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words",
                      isUser ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm",
                    )}
                  >
                    {isUser ? (
                      m.content
                    ) : (
                      <div className="space-y-2">
                        {parts?.map((p, i) => {
                          if (p.kind === "text") {
                            const text = p.text.trim();
                            return text ? <div key={i} className="whitespace-pre-wrap">{text}</div> : null;
                          }
                          return (
                            <div key={i} className="rounded-xl border bg-background/60 p-2 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                  {p.lang || "code"}
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2"
                                  onClick={() => void copyToClipboard(p.code)}
                                >
                                  Копировать
                                </Button>
                              </div>
                              <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-words leading-5">
                                <code>{p.code}</code>
                              </pre>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {!isUser && m.content.trim().length > 0 && (
                    <div className="flex gap-2 mt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => void copyToClipboard(m.content)}
                      >
                        Скопировать
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => void copyToClipboard(toCopilotPrompt(m.content))}
                      >
                        Для Copilot
                      </Button>
                    </div>
                  )}
                </div>
                {isUser && (
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })}

          {isLoading ? <div className="text-xs text-muted-foreground">Печатает…</div> : null}
        </div>
      </ScrollArea>

      <form onSubmit={onSubmit} className="p-3 border-t bg-background">
        <div className="flex items-center gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Сообщение…" disabled={isLoading} />
          <Button type="submit" size="icon" disabled={!canSend}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
