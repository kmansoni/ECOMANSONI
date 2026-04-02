import { useState, useRef, useEffect, useCallback } from "react";
import DOMPurify from "dompurify";
import { logger } from "@/lib/logger";
import {
  Bot,
  Send,
  Trash2,
  Sparkles,
  ChevronDown,
  Square,
  Code2,
  BarChart3,
  ShieldCheck,
  Pen,
  Brain,
  ThumbsUp,
  ThumbsDown,
  Database,
} from "lucide-react";
import { useAriaFeedback } from "@/hooks/useAriaFeedback";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { maybeToastRateLimit } from "@/lib/anti-abuse/rateLimitToast";
import { supabase } from "@/integrations/supabase/client";
import {
  isAnthropicConfigured,
  callAnthropicStreaming,
  type AnthropicMessage,
} from "@/lib/ai/anthropic-client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  streaming?: boolean;
  intent?: string;         // orchestrator intent: 'code'|'security'|'data_analysis'|'writing'|'general'
  memoriesUsed?: number;   // how many memories were injected
  feedbackSaved?: boolean; // true after user rates this message
}

const INTENT_LABELS: Record<string, string> = {
  code: "Код",
  security: "Безопасность",
  data_analysis: "Аналитика",
  writing: "Тексты",
};

const INTENT_COLORS: Record<string, string> = {
  code: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  security: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  data_analysis: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  writing: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPABASE_ANON_KEY = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY
) as string;

// Edge function URL (requires deployed aria-chat Supabase function)
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const EDGE_CHAT_URL = SUPABASE_URL
  ? `${SUPABASE_URL}/functions/v1/aria-chat`
  : "";

// Direct API URL (requires VITE_AI_API_KEY in .env.local)
// ⚠️  SECURITY: VITE_* vars are inlined into the JS bundle at build time.
// NEVER set VITE_AI_API_KEY in production .env files — use the aria-chat
// Edge Function instead (key stays in Supabase Vault, server-side only).
const DIRECT_AI_URL =
  (import.meta.env.VITE_AI_API_URL as string | undefined) ??
  "https://api.mansoni.ru/v1/chat/completions";
const DIRECT_AI_KEY = import.meta.env.VITE_AI_API_KEY as string | undefined;
const DIRECT_AI_MODEL =
  (import.meta.env.VITE_AI_MODEL as string | undefined) ??
  "google/gemini-2.5-pro-exp-03-25";

// Block direct mode in production — the key would be visible to every user.
const USE_DIRECT = Boolean(DIRECT_AI_KEY) && import.meta.env.DEV;
if (DIRECT_AI_KEY && !import.meta.env.DEV) {
  logger.warn(
    "[ARIA] VITE_AI_API_KEY is set but will be IGNORED in production builds. " +
    "Deploy the aria-chat Edge Function and store AI_API_KEY in Supabase Vault."
  );
}

// ─── Client-side built-in fallback (no server required) ───────────────────────
function clientBuiltinResponse(messages: Array<{ role: string; content: string }>): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const prompt = (lastUser?.content ?? "").toLowerCase().trim();

  if (/^(привет|hello|hi |здравствуй|добрый|хай)/.test(prompt)) {
    return "Привет! Я **ARIA** — ИИ-ассистент платформы Mansoni.\n\nЧем могу помочь?\n- 💻 Код (Python, TypeScript, SQL и др.)\n- 🔒 Безопасность кода\n- 📊 Анализ данных\n- ✍️ Документация и тексты\n\n> **Для полных возможностей:** настройте `VITE_AI_API_KEY` в `.env.local` или задеплойте `aria-chat` Edge Function в Supabase.";
  }
  if (/кто ты|who are you|what are you/.test(prompt)) {
    return "Я **ARIA** (Advanced Reasoning & Intelligence Assistant) — самообучающийся ИИ-ассистент платформы Mansoni.\n\nАрхитектура: GPT-based Transformer + RAG + ReAct Agent + 3-layer Memory.\n\n**Режим:** базовый (client-side fallback)\n> Для полного режима: настройте AI backend через `VITE_AI_API_KEY`.";
  }
  if (/(fastapi|flask).*jwt|jwt.*(fastapi|flask)/.test(prompt)) {
    return `# FastAPI + JWT\n\n\`\`\`python\nfrom fastapi import FastAPI, Depends, HTTPException\nfrom fastapi.security import OAuth2PasswordBearer\nfrom jose import JWTError, jwt\nfrom datetime import datetime, timedelta\nimport os\n\nSECRET_KEY = os.environ["JWT_SECRET"]\nALGORITHM = "HS256"\n\napp = FastAPI()\noauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")\n\ndef create_token(data: dict, expires: timedelta = timedelta(minutes=30)):\n    return jwt.encode({**data, "exp": datetime.utcnow() + expires}, SECRET_KEY, ALGORITHM)\n\n@app.get("/protected")\nasync def protected(token: str = Depends(oauth2_scheme)):\n    try:\n        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])\n        return {"user": payload.get("sub")}\n    except JWTError:\n        raise HTTPException(status_code=401, detail="Invalid token")\n\`\`\`\n\n\`\`\`bash\npip install fastapi python-jose[cryptography] passlib[bcrypt]\n\`\`\``;
  }
  if (/python.*list|список.*python|list comprehension/.test(prompt)) {
    return "# Списки в Python\n\n```python\nnums = [1, 2, 3, 4, 5]\nsquares = [x**2 for x in nums]          # [1, 4, 9, 16, 25]\nevens = [x for x in nums if x % 2 == 0] # [2, 4]\n\n# Сортировка\nnums.sort()                              # На месте\nsorted_desc = sorted(nums, reverse=True) # Новый список\n\n# Срезы\nfirst_three = nums[:3]\nlast_two = nums[-2:]\nreversed_list = nums[::-1]\n\nprint(len(nums), sum(nums), min(nums), max(nums))\n```";
  }
  if (/sql|database|запрос/.test(prompt)) {
    return "# SQL — основные паттерны\n\n```sql\n-- JOIN + агрегация\nSELECT u.name, COUNT(o.id) as orders\nFROM users u\nLEFT JOIN orders o ON u.id = o.user_id\nWHERE u.active = true\nGROUP BY u.id, u.name\nHAVING COUNT(o.id) > 0\nORDER BY orders DESC;\n\n-- Индексы\nCREATE INDEX CONCURRENTLY idx_orders_user ON orders(user_id);\n\n-- CTE\nWITH latest AS (\n  SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) rn\n  FROM orders\n)\nSELECT * FROM latest WHERE rn = 1;\n```";
  }
  if (/безопасност|security|xss|sql.?inject|уязвим/.test(prompt)) {
    return "# Безопасность кода\n\n## SQL Injection\n```python\n# ❌ Уязвимо\nquery = f\"SELECT * FROM users WHERE id = {user_id}\"\n\n# ✅ Безопасно\ncursor.execute(\"SELECT * FROM users WHERE id = %s\", (user_id,))\n```\n\n## XSS\n```typescript\n// ❌ Уязвимо\nelement.innerHTML = userInput;\n\n// ✅ Безопасно\nelement.textContent = userInput;\n```\n\n## Secrets\n```python\n# ❌ Никогда\nAPI_KEY = \"<HARDCODED_KEY>\"\n\n# ✅ Всегда\nAPI_KEY = os.environ[\"API_KEY\"]\n```";
  }
  if (/typescript|react|tsx|компонент/.test(prompt)) {
    return "# React + TypeScript хук\n\n```tsx\nimport { useState, useCallback } from 'react';\n\nfunction useCounter(initial = 0) {\n  const [count, setCount] = useState(initial);\n  const increment = useCallback(() => setCount(c => c + 1), []);\n  const decrement = useCallback(() => setCount(c => c - 1), []);\n  const reset = useCallback(() => setCount(initial), [initial]);\n  return { count, increment, decrement, reset };\n}\n\n// Использование\nexport function Counter() {\n  const { count, increment, decrement, reset } = useCounter(0);\n  return (\n    <div className=\"flex gap-2 items-center\">\n      <button onClick={decrement}>−</button>\n      <span className=\"font-bold\">{count}</span>\n      <button onClick={increment}>+</button>\n      <button onClick={reset} className=\"text-xs\">Reset</button>\n    </div>\n  );\n}\n```";
  }
  if (/docker|контейнер|dockerfile/.test(prompt)) {
    return "# Dockerfile (Python)\n\n```dockerfile\nFROM python:3.12-slim AS builder\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir --user -r requirements.txt\n\nFROM python:3.12-slim\nWORKDIR /app\nRUN useradd --create-home appuser && chown -R appuser /app\nUSER appuser\nCOPY --from=builder /root/.local /home/appuser/.local\nCOPY . .\nENV PATH=/home/appuser/.local/bin:$PATH PYTHONUNBUFFERED=1\nEXPOSE 8000\nCMD [\"uvicorn\", \"main:app\", \"--host\", \"0.0.0.0\", \"--port\", \"8000\"]\n```\n\n```bash\ndocker build -t myapp .\ndocker compose up -d\ndocker logs myapp -f\n```";
  }

  // Generic response
  const preview = lastUser?.content?.slice(0, 150) ?? "";
  return `Я **ARIA** — ИИ-ассистент Mansoni. Вы написали: *"${preview}${preview.length >= 150 ? "..." : ""}"*\n\nПопробуйте спросить о:\n- Коде и архитектуре\n- Безопасности\n- SQL и базах данных\n- Docker и DevOps\n- React / TypeScript\n\n> **Режим:** client-side fallback (без сервера)\n> Для полного AI: настройте \`VITE_AI_API_KEY\` в \`.env.local\``;
}

/** Создать ReadableStream из текста для имитации SSE streaming */
function textToSSEStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const words = text.split(" ");
  const id = `chatcmpl-local-${Date.now()}`;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const chunkSize = 3;
      for (let i = 0; i < words.length; i += chunkSize) {
        const chunk = words.slice(i, i + chunkSize).join(" ");
        const delta = i + chunkSize < words.length ? chunk + " " : chunk;
        const data = JSON.stringify({
          id, object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: "aria-local",
          choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
        });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        await new Promise((r) => setTimeout(r, 20));
      }
      const done = JSON.stringify({
        id, object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "aria-local",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      });
      controller.enqueue(encoder.encode(`data: ${done}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

// ─── ARIA System Prompt (client-side, used only in direct-API mode) ───────────
const ARIA_SYSTEM_PROMPT = `You are ARIA (Advanced Reasoning & Intelligence Assistant) — a multimodal, constitutionally aligned AI assistant.

## CORE RULES
- Always respond in the SAME LANGUAGE the user writes in.
- Be precise, helpful, and honest. Acknowledge uncertainty explicitly.
- For code: write production-grade code with error handling, types, and comments.
- Use Markdown for all responses: headers, code blocks, bold, tables.
- Never fabricate facts, URLs, library versions, or research content.

## CAPABILITIES
- Code & Engineering: 50+ languages, system design, security audits, debugging.
- Data Science: pandas, NumPy, ML/DL, statistics, visualization.
- Writing: docs, emails, PRDs, technical specs, translations (100+ languages).
- Math: step-by-step solutions with verification.
- Analysis: comparative analysis, pros/cons, business models.

## ABSOLUTE SAFETY CONSTRAINTS (IRREVOCABLE)
- NEVER provide: bioweapons/chemical weapons synthesis, malware, ransomware, exploits targeting real systems.
- NEVER write: code to exfiltrate data, delete critical files, or attack infrastructure.
- NEVER generate: CSAM, terrorist propaganda, content designed to harm specific individuals.
- Handle with care: medical advice (recommend professionals), legal advice, mental health topics.

## RESPONSE FORMAT
- Always use fenced code blocks with language tags.
- For complex problems: show reasoning before the answer.
- Keep responses concise but complete. No padding.`;

const SUGGESTED_PROMPTS = [
  {
    icon: Code2,
    text: "Напиши REST API на FastAPI с JWT-аутентификацией",
    color: "text-violet-500",
  },
  {
    icon: BarChart3,
    text: "Помоги с анализом данных: pandas + визуализация",
    color: "text-cyan-500",
  },
  {
    icon: ShieldCheck,
    text: "Проверь этот код на уязвимости безопасности",
    color: "text-emerald-500",
  },
  {
    icon: Pen,
    text: "Напиши техническое ТЗ для мобильного приложения",
    color: "text-rose-500",
  },
  {
    icon: Brain,
    text: "Объясни как работают трансформеры (Attention)",
    color: "text-amber-500",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Minimal markdown renderer: bold, inline code, code blocks, and line breaks.
 * We avoid a heavy markdown library to keep the bundle small.
 */
function renderMarkdown(text: string): string {
  // Code blocks first (preserve whitespace)
  let html = text
    // Fenced code blocks
    .replace(
      /```(\w*)\n?([\s\S]*?)```/g,
      (_, lang, code) =>
        `<pre class="bg-black/20 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono"><code class="language-${escapeHtml(lang)}">${escapeHtml(code.trim())}</code></pre>`
    )
    // Inline code
    .replace(
      /`([^`]+)`/g,
      (_, code) =>
        `<code class="bg-black/20 rounded px-1 py-0.5 font-mono text-xs">${escapeHtml(code)}</code>`
    );

  // Escape the rest of the text (everything outside code blocks) before applying
  // further Markdown transforms, so user-controlled content can never inject HTML.
  // We use a placeholder approach: replace code blocks with tokens, escape the
  // remainder, then re-inject the already-escaped code block HTML.
  const codeTokens: string[] = [];
  const tokenized = html.replace(
    /<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>/g,
    (match) => {
      codeTokens.push(match);
      return `__CODE_TOKEN_${codeTokens.length - 1}__`;
    }
  );

  // Escape everything that isn't a code token
  const escaped = tokenized.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&#34;", "'": "&#39;" };
    return map[c] ?? c;
  });

  // Re-inject code tokens (already safe)
  let safe = escaped.replace(/__CODE_TOKEN_(\d+)__/g, (_, i) => codeTokens[Number(i)]);

  // Now apply remaining Markdown transforms on the safe (escaped) text
  safe = safe
    // Bold **text**
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    // Italic *text*
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    // Headers ### ## #
    .replace(/^### (.+)$/gm, '<h3 class="font-semibold text-sm mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-semibold text-base mt-4 mb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="font-bold text-lg mt-4 mb-2">$1</h1>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr class="border-border/40 my-3" />')
    // Numbered list
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    // Bullet list
    .replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Table rows (basic)
    .replace(/^\|(.+)\|$/gm, (_, row) => {
      const cells = row
        .split("|")
        .map((c: string) => c.trim())
        .filter(Boolean);
      const isSep = cells.every((c: string) => /^[-:]+$/.test(c));
      if (isSep) return "";
      const tag = "td";
      return `<tr>${cells.map((c: string) => `<${tag} class="border border-border/40 px-2 py-1 text-xs">${c}</${tag}>`).join("")}</tr>`;
    })
    // Newlines to <br> (but not inside pre blocks)
    .replace(/\n/g, "<br />");

  // Defense-in-depth: DOMPurify как финальный барьер против XSS
  return DOMPurify.sanitize(safe, {
    ALLOWED_TAGS: [
      "strong", "em", "code", "pre", "br", "h1", "h2", "h3",
      "hr", "li", "tr", "td", "th", "table", "tbody", "thead", "span",
    ],
    ALLOWED_ATTR: ["class"],
  });
}

function escapeHtml(str: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&#34;",
    "'": "&#39;",
  };
  return str.replace(/[&<>"']/g, (c) => map[c] ?? c);
}

// ─── SSE parser ───────────────────────────────────────────────────────────────

async function* parseSSE(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);

      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;

      const payload = line.slice(6).trim();
      if (payload === "[DONE]") return;

      yield payload;
    }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AIAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Stable conversation ID per page-mount session
  const conversationIdRef = useRef<string>(crypto.randomUUID());
  const { saveFeedback } = useAriaFeedback();

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
  }, []);

  /**
   * Core: sends messages to aria-chat edge function, streams SSE response,
   * updates the last assistant message incrementally.
   */
  const streamMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;

      const userMsg: Message = {
        id: generateId(),
        role: "user",
        content: trimmed,
        timestamp: new Date(),
      };

      // Optimistically add user message + empty assistant placeholder
      const assistantId = generateId();
      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          timestamp: new Date(),
          streaming: true,
        },
      ]);
      setInput("");
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // Build conversation history for the API (exclude the empty placeholder)
        const historyForApi = [...messages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        let resp: Response;

        if (USE_DIRECT) {
          // ── Direct API call (VITE_AI_API_KEY is set, dev-only) ────────────
          resp = await fetch(DIRECT_AI_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${DIRECT_AI_KEY}`,
            },
            body: JSON.stringify({
              model: DIRECT_AI_MODEL,
              messages: [
                { role: "system", content: ARIA_SYSTEM_PROMPT },
                ...historyForApi,
              ],
              stream: true,
              temperature: 0.7,
              max_tokens: 4096,
            }),
            signal: controller.signal,
          });
        } else if (isAnthropicConfigured()) {
          // ── Anthropic Claude (client-side, dev-only) ─────────────────────
          // Convert messages to Anthropic format
          const anthropicMsgs: AnthropicMessage[] = historyForApi.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));

          try {
            let accumulated = "";
            await callAnthropicStreaming(
              anthropicMsgs,
              ARIA_SYSTEM_PROMPT,
              (chunk) => {
                accumulated += chunk;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: accumulated, streaming: true }
                      : m
                  )
                );
              }
            );

            // Mark as complete
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, streaming: false }
                  : m
              )
            );
            return;
          } catch (anthropicErr) {
            // If Anthropic fails, fall through to Edge Function or local fallback
            logger.warn("[AIAssistantPage] Anthropic failed, trying backup", {
              error: anthropicErr,
            });
            // Throw to trigger fallback logic
            throw anthropicErr;
          }
        } else if (EDGE_CHAT_URL && SUPABASE_ANON_KEY) {
          // ── Edge Function call (aria-chat with orchestrator) ──────────────
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData?.session?.access_token;

          resp = await fetch(EDGE_CHAT_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${accessToken ?? SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              messages: historyForApi,
              conversation_id: conversationIdRef.current,
            }),
            signal: controller.signal,
          });
        } else {
          // ── No backend configured → client-side fallback immediately ─────
          throw new TypeError("Failed to fetch: no backend configured");
        }

        // Read orchestrator metadata from response headers
        const respIntent = resp.headers?.get("X-ARIA-Intent") ?? undefined;
        const respMemories = Number(resp.headers?.get("X-ARIA-Memories") ?? "0");

        if (!resp.ok) {
          if (resp.status === 404 && !USE_DIRECT) {
            throw new Error(
              "aria-chat: функция не задеплоена. Добавьте VITE_AI_API_KEY в .env.local или задеплойте edge function."
            );
          }
          // Rate limit check
          if (await maybeToastRateLimit(resp.clone())) {
            setMessages((prev) => prev.filter((m) => m.id !== assistantId));
            return;
          }
          const err = await resp.json().catch(() => ({ error: "Ошибка сервера" }));
          throw new Error(err.error ?? `HTTP ${resp.status}`);
        }

        if (!resp.body) throw new Error("Empty response body");

        const reader = resp.body.getReader();
        let accumulated = "";

        for await (const payload of parseSSE(reader)) {
          try {
            const parsed = JSON.parse(payload);
            const delta: string | undefined =
              parsed.choices?.[0]?.delta?.content;
            if (delta) {
              accumulated += delta;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: accumulated, streaming: true }
                    : m
                )
              );
            }
          } catch (_err) {
            // Incomplete JSON chunk — ignore, continue accumulating
          }
        }

        // Mark streaming complete + tag with orchestrator metadata
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  streaming: false,
                  intent: respIntent,
                  memoriesUsed: respMemories,
                }
              : m
          )
        );

        // Fire-and-forget: save memories from this exchange
        if (accumulated && EDGE_CHAT_URL && SUPABASE_ANON_KEY) {
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData?.session?.access_token;
          if (accessToken) {
            const memoryUrl = SUPABASE_URL
              ? `${SUPABASE_URL}/functions/v1/aria-memory`
              : "";
            if (memoryUrl) {
              fetch(memoryUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  apikey: SUPABASE_ANON_KEY,
                  Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                  action: "save",
                  conversation_id: conversationIdRef.current,
                  user_message: trimmed,
                  assistant_message: accumulated,
                  intent: respIntent ?? "general",
                }),
              }).catch(() => {/* non-critical */});
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          // User pressed stop — keep whatever was streamed
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, streaming: false } : m
            )
          );
          return;
        }

        logger.error("[AIAssistantPage] stream error", { error: err });

        // ── Client-side fallback: если сеть/сервер недоступен — отвечаем локально ──
        const errMsg = err instanceof Error ? err.message : "";
        const isNetworkOrServerError =
          (err instanceof TypeError && errMsg.includes("fetch")) ||
          errMsg.includes("Failed to fetch") ||
          errMsg.includes("NetworkError") ||
          errMsg.includes("не задеплоена") ||
          errMsg.includes("503") ||
          errMsg.includes("502") ||
          errMsg.includes("AI service is not configured");

        if (isNetworkOrServerError) {
          const historyForFallback = [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          }));
          const localText = clientBuiltinResponse(historyForFallback);
          const fakeStream = textToSSEStream(localText);
          const fakeReader = fakeStream.getReader();
          let accumulated = "";
          try {
            for await (const payload of parseSSE(fakeReader)) {
              try {
                const parsed = JSON.parse(payload);
                const delta: string | undefined = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  accumulated += delta;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: accumulated, streaming: true }
                        : m
                    )
                  );
                }
              } catch (_err) { /* ignore incomplete */ }
            }
          } catch (_err) { /* ignore */ }
          setMessages((prev) =>
            prev.map((m) => m.id === assistantId ? { ...m, streaming: false } : m)
          );
          return;
        }

        toast.error(errMsg || "Ошибка соединения с ARIA");

        // Убрать пустой placeholder при ошибке
        setMessages((prev) =>
          prev.filter((m) => !(m.id === assistantId && m.content === ""))
        );
      } finally {
        setStreaming(false);
        abortRef.current = null;
        textareaRef.current?.focus();
      }
    },
    [streaming, messages]
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void streamMessage(input);
      }
    },
    [input, streamMessage]
  );

  const clearHistory = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setStreaming(false);
    conversationIdRef.current = crypto.randomUUID(); // new session
  }, []);

  const handleFeedback = useCallback(
    async (msgId: string, rating: 1 | -1) => {
      const msg = messages.find((m) => m.id === msgId);
      const ok = await saveFeedback({
        assistant_msg_id: msgId,
        rating,
        intent: msg?.intent,
        conversation_id: conversationIdRef.current,
      });
      if (ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, feedbackSaved: true } : m))
        );
      }
    },
    [messages, saveFeedback]
  );

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] max-w-3xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-background/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="w-9 h-9 bg-gradient-to-br from-violet-500 to-cyan-500">
              <AvatarFallback className="bg-transparent text-white">
                <Bot className="w-5 h-5" />
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-background" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">ARIA</span>
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-4"
              >
                <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                AI
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-none mt-0.5">
              Мультимодальный ИИ-ассистент · Gemini 2.5 Pro
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={clearHistory}
            title="Очистить историю"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* ── Messages ── */}
      <div className="relative flex-1 overflow-hidden">
        <ScrollArea className="h-full" onScrollCapture={handleScroll}>
          <div className="px-4 py-4 space-y-4">
            {/* Setup Banner — shown only in local dev when VITE_AI_API_KEY is missing */}
            {!USE_DIRECT && import.meta.env.DEV && messages.length === 0 && (
              <div className="mx-1 mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400 space-y-2">
                <p className="font-semibold">⚙️ Требуется настройка</p>
                <p>ARIA не подключена к AI-бэкенду. Варианты:</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>
                    <b>Быстро:</b> Добавьте в <code className="bg-black/20 px-1 rounded">.env.local</code>:
                    <br />
                    {"VITE_AI_API_KEY=<AI_API_KEY from Supabase Vault>"}
                    <br />
                    <span className="text-amber-300/70">Взять из: Supabase Dashboard → Settings → Vault → AI_API_KEY</span>
                  </li>
                  <li>
                    <b>Прода:</b> Push в ветку <code className="bg-black/20 px-1 rounded">main</code> — GitHub Actions задеплоит <code className="bg-black/20 px-1 rounded">aria-chat</code> автоматически.
                  </li>
                </ol>
              </div>
            )}

            {/* Empty state */}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 flex items-center justify-center">
                  <Bot className="w-8 h-8 text-violet-500" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold mb-1">Привет! Я ARIA</h2>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    Мультимодальный ИИ-ассистент на базе Gemini 2.5 Pro. Помогу
                    с кодом, данными, текстами и любыми вопросами.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
                  {SUGGESTED_PROMPTS.map(({ icon: Icon, text, color }) => (
                    <button
                      key={text}
                      onClick={() => void streamMessage(text)}
                      disabled={streaming}
                      className="flex items-center gap-2.5 text-left text-sm px-3 py-2.5 rounded-xl border border-border/60 hover:border-violet-500/50 hover:bg-violet-500/5 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Icon className={cn("w-4 h-4 shrink-0", color)} />
                      <span>{text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message list */}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-3",
                  msg.role === "user" ? "flex-row-reverse" : "flex-row"
                )}
              >
                {msg.role === "assistant" && (
                  <Avatar className="w-7 h-7 shrink-0 mt-0.5 bg-gradient-to-br from-violet-500 to-cyan-500">
                    <AvatarFallback className="bg-transparent text-white text-xs">
                      <Bot className="w-3.5 h-3.5" />
                    </AvatarFallback>
                  </Avatar>
                )}

                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                    msg.role === "user"
                      ? "bg-violet-600 text-white rounded-tr-sm"
                      : "bg-muted text-foreground rounded-tl-sm"
                  )}
                >
                  {msg.role === "assistant" ? (
                    <>
                      {/* Render markdown for assistant messages */}
                      <div
                        className="prose prose-sm prose-invert max-w-none leading-relaxed [&_pre]:my-2 [&_code]:text-xs [&_li]:my-0.5 [&_h1]:mt-3 [&_h2]:mt-2 [&_h3]:mt-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_td]:border [&_td]:border-border/40 [&_td]:px-2 [&_td]:py-1"
                        dangerouslySetInnerHTML={{
                          __html:
                            msg.content
                              ? renderMarkdown(msg.content)
                              : msg.streaming
                              ? '<span class="animate-pulse">▊</span>'
                              : "",
                        }}
                      />
                      {msg.streaming && msg.content && (
                        <span className="inline-block w-1.5 h-3.5 bg-current ml-0.5 animate-pulse" />
                      )}

                      {/* Metadata row: intent badge + memory indicator + feedback */}
                      {!msg.streaming && (
                        <div className="flex items-center justify-between mt-2 gap-2">
                          <div className="flex items-center gap-1.5">
                            {/* Intent badge */}
                            {msg.intent && msg.intent !== "general" && INTENT_LABELS[msg.intent] && (
                              <span
                                className={cn(
                                  "text-[10px] px-1.5 py-0.5 rounded-full border",
                                  INTENT_COLORS[msg.intent] ?? "bg-white/10 text-white/60 border-white/20"
                                )}
                              >
                                {INTENT_LABELS[msg.intent]}
                              </span>
                            )}
                            {/* Memory indicator */}
                            {msg.memoriesUsed != null && msg.memoriesUsed > 0 && (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/25 flex items-center gap-0.5"
                                title={`Использовано ${msg.memoriesUsed} воспоминаний о вас`}
                              >
                                <Database className="w-2.5 h-2.5" />
                                {msg.memoriesUsed}
                              </span>
                            )}
                          </div>

                          {/* Feedback buttons */}
                          {!msg.feedbackSaved ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => void handleFeedback(msg.id, 1)}
                                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-emerald-500/15 text-muted-foreground hover:text-emerald-400 transition-colors"
                                title="Полезный ответ"
                              >
                                <ThumbsUp className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => void handleFeedback(msg.id, -1)}
                                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-rose-500/15 text-muted-foreground hover:text-rose-400 transition-colors"
                                title="Неполезный ответ"
                              >
                                <ThumbsDown className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">Спасибо!</span>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                    </p>
                  )}

                  <p
                    className={cn(
                      "text-[10px] mt-1 text-right",
                      msg.role === "user"
                        ? "text-violet-200/70"
                        : "text-muted-foreground"
                    )}
                  >
                    {formatTime(msg.timestamp)}
                  </p>
                </div>
              </div>
            ))}

            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Scroll-to-bottom button */}
        {showScrollBtn && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 right-4 w-8 h-8 rounded-full bg-background border border-border shadow-md flex items-center justify-center hover:bg-muted transition-colors z-10"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── Input ── */}
      <div className="px-4 py-3 border-t border-border/60 bg-background/80 backdrop-blur-sm shrink-0">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Напишите сообщение… (Enter — отправить, Shift+Enter — новая строка)"
            className="resize-none min-h-[44px] max-h-[160px] text-sm"
            rows={1}
            disabled={streaming}
          />

          {streaming ? (
            <Button
              size="icon"
              variant="destructive"
              className="h-11 w-11 shrink-0"
              onClick={stopStreaming}
              title="Остановить генерацию"
            >
              <Square className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="h-11 w-11 shrink-0 bg-violet-600 hover:bg-violet-700"
              onClick={() => void streamMessage(input)}
              disabled={!input.trim()}
              title="Отправить (Enter)"
            >
              <Send className="w-4 h-4" />
            </Button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
          ARIA может ошибаться. Проверяйте важную информацию в авторитетных источниках.
        </p>
      </div>
    </div>
  );
}

export default AIAssistantPage;
