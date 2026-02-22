// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  handleCors,
  getCorsHeaders,
  checkRateLimit,
  getClientId,
  rateLimitResponse,
} from "../_shared/utils.ts";

const systemPrompt = `Ты — AI-помощник внутри веб-мессенджера mansoni.

Пользователь использует этот чат, чтобы формулировать задачи на изменения в коде и запускать PR.
Важно: у тебя НЕТ прямого доступа к его локальной IDE/терминалу.
- Можно предлагать команды и патчи.
- Нельзя утверждать, что ты уже что-то выполнил локально.

КЛЮЧЕВОЙ ПРИНЦИП: НЕ ЛОМАТЬ то, что уже работает. Изменения только минимально необходимые.

ПРОФЕССИОНАЛЬНОСТЬ:
- Избегай AI-шума (не добавляй лишние "console.log", лишние абстракции, лишние файлы).
- Делай чистые решения в стиле проекта, без случайных элементов.
- Если есть выбор: выбирай самый простой и совместимый.

ПРО "ИЗУЧИТЬ ИНТЕРНЕТ":
- У тебя нет надёжного доступа к полноценному веб-поиску.
- Ты можешь использовать общие отраслевые практики и паттерны.
- Если нужно точное сравнение конкурентов/фич — попроси 2-5 ссылок на референсы (сайты/скриншоты/описания), и тогда ты их разберёшь.

ЯЗЫК: русский.

ОБЯЗАТЕЛЬНЫЙ GATE ДЛЯ БОЛЬШИХ ФИЧ (например «модуль недвижимости»):
Сначала: задай до 6 уточняющих вопросов и дождись ответов. НЕ предлагай код/патчи до подтверждения требований.

ФОРМАТ ОТВЕТА:
- Если требуется уточнение: "Вопросы" (список) + "Черновой контур решения" (очень кратко).
- Если всё ясно: Подтверждение (1 строка) → План (1-7) → Команды (\`\`\`sh) → Патч (\`\`\`diff) → Проверка.
`;

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

function sseDeltaPayload(content: string) {
  return {
    id: crypto.randomUUID(),
    object: "chat.completion.chunk",
    choices: [{ index: 0, delta: { content } }],
  };
}

function encodeSseDataLine(obj: unknown): Uint8Array {
  const enc = new TextEncoder();
  return enc.encode(`data: ${JSON.stringify(obj)}\n\n`);
}

function encodeSseDone(): Uint8Array {
  const enc = new TextEncoder();
  return enc.encode("data: [DONE]\n\n");
}

function chunkText(text: string, size = 700): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    out.push(text.slice(i, i + size));
    i += size;
  }
  return out;
}

function lastUserText(messages: ChatMsg[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return String(messages[i]?.content ?? "");
  }
  return "";
}

function shouldUsePanel(userText: string): boolean {
  const t = (userText || "").toLowerCase();
  // Heuristic: module/design/planning requests benefit from multi-agent panel.
  return (
    t.includes("модул") ||
    t.includes("архитект") ||
    t.includes("спроект") ||
    t.includes("дизайн") ||
    t.includes("план") ||
    t.includes("исслед") ||
    t.includes("конкур") ||
    t.includes("что нужно") ||
    t.includes("чего нет") ||
    t.includes("не ломать")
  );
}

function clampMessages(messages: ChatMsg[], max = 14): ChatMsg[] {
  if (!Array.isArray(messages)) return [];
  if (messages.length <= max) return messages;
  return messages.slice(messages.length - max);
}

async function callUpstream({ apiKey, baseUrl, model, messages, stream }: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: ChatMsg[];
  stream: boolean;
}): Promise<Response> {
  const provider = String(Deno.env.get("AI_PROVIDER") || "openai_compat").toLowerCase();
  const maxTokens = Number(Deno.env.get("AI_MAX_TOKENS") || (stream ? 1600 : 1800));

  if (provider === "anthropic") {
    const url = `${(baseUrl || "https://api.anthropic.com/v1").replace(/\/$/, "")}/messages`;
    const system = messages.find((m) => m.role === "system")?.content || "";
    const nonSystem = messages.filter((m) => m.role === "user" || m.role === "assistant");
    const anthropicMsgs = nonSystem.map((m) => ({
      role: m.role,
      content: [{ type: "text", text: String(m.content ?? "") }],
    }));

    return fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        system,
        messages: anthropicMsgs,
        max_tokens: maxTokens,
        temperature: 0.2,
        stream,
      }),
    });
  }

  // Default: OpenAI-compatible chat/completions
  return fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, stream }),
  });
}

async function getAssistantText(resp: Response): Promise<string> {
  const provider = String(Deno.env.get("AI_PROVIDER") || "openai_compat").toLowerCase();
  const json: any = await resp.json().catch(() => null);

  if (provider === "anthropic") {
    const blocks = Array.isArray(json?.content) ? json.content : [];
    const text = blocks
      .filter((b: any) => b && (b.type === "text" || typeof b.text === "string"))
      .map((b: any) => String(b.text ?? ""))
      .join("");
    return text.trim();
  }

  const content = json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.text ?? "";
  return String(content || "").trim();
}

function anthropicDeltaFromEvent(eventName: string, data: any): string {
  // Streaming: content_block_delta -> delta.text
  if (eventName === "content_block_delta") {
    const t = data?.delta?.text;
    return typeof t === "string" ? t : "";
  }
  // Some gateways use type fields
  if (data?.type === "content_block_delta") {
    const t = data?.delta?.text;
    return typeof t === "string" ? t : "";
  }
  return "";
}

function isAnthropicDone(eventName: string, data: any): boolean {
  if (eventName === "message_stop") return true;
  if (data?.type === "message_stop") return true;
  return false;
}

async function anthropicStreamToOpenAiSse(anthropicResp: Response): Promise<ReadableStream<Uint8Array>> {
  const reader = anthropicResp.body?.getReader();
  if (!reader) throw new Error("No stream body");
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.enqueue(encodeSseDone());
        controller.close();
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line) continue;

        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim();
          continue;
        }
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        let data: any;
        try {
          data = JSON.parse(payload);
        } catch {
          continue;
        }

        if (isAnthropicDone(currentEvent, data)) {
          controller.enqueue(encodeSseDone());
          controller.close();
          try { await reader.cancel(); } catch {}
          return;
        }

        const delta = anthropicDeltaFromEvent(currentEvent, data);
        if (delta) {
          controller.enqueue(encodeSseDataLine(sseDeltaPayload(delta)));
        }
      }
    },
    async cancel() {
      try { await reader.cancel(); } catch {}
    },
  });
}

function agentPrompt(title: string, focus: string): string {
  return [
    `Ты — отдельный AI-агент в совете. Роль: ${title}.`,
    "Задача: помочь спроектировать/спланировать изменения так, чтобы НЕ ЛОМАТЬ существующий продукт.",
    "Дай ответ кратко и по делу.",
    "Не добавляй лишние сущности: только то, что реально нужно.",
    "Структура:",
    "- Что проверить в текущем проекте (3-7 пунктов)",
    "- Что добавить/изменить (3-10 пунктов)",
    "- Риски регрессий (1-5 пунктов)",
    "- Минимальный план внедрения (3-7 шагов)",
    "",
    `Фокус: ${focus}`,
  ].join("\n");
}

const PANEL_AGENTS = [
  {
    name: "Product/Scope",
    focus: "Разложи модуль на user stories, границы MVP, что точно НЕ трогать, какие зависимости и точки интеграции. Предложи уникальные фичи уровня рынка (best practices).",
  },
  {
    name: "Frontend/UX",
    focus: "Компоненты, роуты, состояние, соответствие существующим UI-паттернам/токенам, мобильный UX. Что можно переиспользовать из текущего приложения.",
  },
  {
    name: "Backend/DB",
    focus: "Схема БД, миграции, RLS, индексы, RPC, Edge Functions, безопасность, совместимость. Миграции только additive/backcompat.",
  },
  {
    name: "QA/Testing",
    focus: "Какие тесты добавить/обновить (Vitest/Playwright), критические пути, мониторинг, откат.",
  },
  {
    name: "Risk/Regression",
    focus: "Где можно сломать существующее, как минимизировать риск, фича-флаги, обратная совместимость. Плюс как убрать 'AI-след' и сохранить чистоту кода.",
  },
];

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const clientId = getClientId(req);
    const rateLimit = checkRateLimit(clientId);
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit.resetIn, origin);
    }

    const { messages } = await req.json();

    const AI_API_KEY = Deno.env.get("AI_API_KEY");
    if (!AI_API_KEY) throw new Error("AI_API_KEY is not configured");

    const provider = String(Deno.env.get("AI_PROVIDER") || "openai_compat").toLowerCase();
    const baseUrl = Deno.env.get("AI_BASE_URL") || (provider === "anthropic" ? "https://api.anthropic.com/v1" : "https://api.mansoni.ru/v1");
    const model = Deno.env.get("AI_MODEL") || (provider === "anthropic" ? "claude-3-7-sonnet-latest" : "google/gemini-3-flash-preview");

    const incoming = (Array.isArray(messages) ? messages : []) as ChatMsg[];
    const recent = clampMessages(incoming, 14);
    const userText = lastUserText(recent);

    // Multi-agent deliberation for planning/module requests.
    if (shouldUsePanel(userText)) {
      const agentCalls = PANEL_AGENTS.map(async (a) => {
        try {
          const resp = await callUpstream({
            apiKey: AI_API_KEY,
            baseUrl,
            model,
            stream: false,
            messages: [
              { role: "system", content: agentPrompt(a.name, a.focus) },
              { role: "system", content: "Контекст диалога ниже. Не придумывай файлы/код, если их нет в контексте." },
              ...recent,
            ],
          });
          if (!resp.ok) {
            const t = await resp.text().catch(() => "");
            return { name: a.name, ok: false, text: `ERROR ${resp.status}: ${t}` };
          }
          const text = await getAssistantText(resp);
          return { name: a.name, ok: true, text };
        } catch (e) {
          return { name: a.name, ok: false, text: e instanceof Error ? e.message : String(e) };
        }
      });

      // Stream the panel outputs progressively (agent notes), then a synthesized final answer.
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            controller.enqueue(encodeSseDataLine(sseDeltaPayload("Запускаю совет агентов (Product/UX/DB/QA/Risk)…\n")));
            controller.enqueue(
              encodeSseDataLine(
                sseDeltaPayload(
                  "Покажу их заметки по мере готовности, затем дам один согласованный итог.\n\n",
                ),
              ),
            );

            // Make promises identifiable for progressive yielding.
            const pending = new Map<number, Promise<{ idx: number; res: any }>>();
            agentCalls.forEach((p, idx) => {
              pending.set(
                idx,
                p.then((res) => ({ idx, res })),
              );
            });

            const agentResults: any[] = new Array(agentCalls.length);

            while (pending.size) {
              const race = await Promise.race(Array.from(pending.values()));
              pending.delete(race.idx);
              agentResults[race.idx] = race.res;

              const r = race.res;
              const header = `### Агент: ${r.name} (${r.ok ? "готово" : "ошибка"})\n`;
              const body = String(r.text || "").trim();
              const block = `${header}${body}\n\n`;
              for (const ch of chunkText(block, 900)) {
                controller.enqueue(encodeSseDataLine(sseDeltaPayload(ch)));
              }
            }

            const synthesisSystem = [
              systemPrompt,
              "\nДОП ПРАВИЛО: Ты — синтезатор совета агентов.",
              "- Объедини идеи, убери противоречия, выбери один реалистичный путь.",
              "- Обязательно соблюдай принцип: НЕ ЛОМАТЬ то, что уже работает.",
              "- Если есть варианты, выбери самый простой, совместимый с текущим кодом.",
              "- Если запрос большой и не хватает контекста — задай вопросы (до 6) и НЕ переходи к коду/патчам, пока пользователь не ответит и не подтвердит.",
              "- Наружу выдай один итоговый согласованный результат.",
              "- НЕ раскрывай скрытые мыслительные цепочки; можно опираться на заметки агентов выше.",
              "\nВ конце: итог + следующий шаг (что ты ждёшь от пользователя).",
            ].join("\n");

            const synthesisMessages: ChatMsg[] = [
              { role: "system", content: synthesisSystem },
              ...recent,
              {
                role: "assistant",
                content:
                  "Заметки совета агентов (для синтеза):\n\n" +
                  agentResults
                    .map((r) => `### AGENT: ${r.name} (${r.ok ? "ok" : "err"})\n${r.text}`)
                    .join("\n\n"),
              },
            ];

            const synthResp = await callUpstream({
              apiKey: AI_API_KEY,
              baseUrl,
              model,
              messages: synthesisMessages,
              stream: false,
            });

            if (!synthResp.ok) {
              const t = await synthResp.text().catch(() => "");
              const msg = `Синтез не удался: ${synthResp.status} ${t}`;
              controller.enqueue(encodeSseDataLine(sseDeltaPayload(`\n\n${msg}\n`)));
              controller.enqueue(encodeSseDone());
              controller.close();
              return;
            }

            const finalText = await getAssistantText(synthResp);
            controller.enqueue(encodeSseDataLine(sseDeltaPayload("## Итог (согласовано)\n")));
            for (const ch of chunkText(`\n${finalText}\n`, 900)) {
              controller.enqueue(encodeSseDataLine(sseDeltaPayload(ch)));
            }

            controller.enqueue(encodeSseDone());
            controller.close();
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            controller.enqueue(encodeSseDataLine(sseDeltaPayload(`Ошибка: ${msg}`)));
            controller.enqueue(encodeSseDone());
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "X-RateLimit-Remaining": String(rateLimit.remaining),
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const response = await callUpstream({
      apiKey: AI_API_KEY,
      baseUrl,
      model,
      messages: [{ role: "system", content: systemPrompt }, ...recent],
      stream: true,
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Слишком много запросов." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Превышен лимит AI." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const errorText = await response.text().catch(() => "");
      console.error("ai-companion error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Ошибка AI" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (provider === "anthropic") {
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error("ai-companion anthropic error:", response.status, errorText);
        return new Response(JSON.stringify({ error: "Ошибка AI" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const stream = await anthropicStreamToOpenAiSse(response);
      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "X-RateLimit-Remaining": String(rateLimit.remaining),
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "X-RateLimit-Remaining": String(rateLimit.remaining),
      },
    });
  } catch (e) {
    console.error("ai-companion error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
