/**
 * Бесплатные AI провайдеры для ARIA.
 *
 * Порядок приоритета:
 *  1. Groq  — бесплатный ключ, быстрый inference (llama-3.3-70b)
 *  2. Google AI Studio — бесплатный tier Gemini (60 RPM)
 *  3. OpenRouter — бесплатные модели (:free суффикс)
 *  4. HuggingFace Inference — бесплатный tier
 *
 * Настройка: один из env-ключей в .env.local:
 *   VITE_GROQ_API_KEY=gsk_...
 *   VITE_GOOGLE_AI_KEY=AIza...
 *   VITE_OPENROUTER_KEY=sk-or-...
 *   VITE_HF_TOKEN=hf_...
 *
 * ⚠️  VITE_* переменные попадают в бандл — использовать ТОЛЬКО для dev.
 */

import { logger } from "@/lib/logger";

export interface FreeProviderConfig {
  name: string;
  url: string;
  model: string;
  headers: Record<string, string>;
  transformBody: (messages: Array<{ role: string; content: string }>, system: string) => unknown;
  parseSSE: (line: string) => string | null;
}

// ─── Groq (бесплатный — llama-3.3-70b, mixtral, gemma2) ──────────────────────

function groqProvider(key: string): FreeProviderConfig {
  return {
    name: "Groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.3-70b-versatile",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    transformBody: (messages, system) => ({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: system }, ...messages],
      stream: true,
      temperature: 0.7,
      max_tokens: 4096,
    }),
    parseSSE: openaiStyleParse,
  };
}

// ─── Google AI Studio (Gemini бесплатный — 60 RPM) ───────────────────────────

function googleProvider(key: string): FreeProviderConfig {
  return {
    name: "Google Gemini",
    url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${key}`,
    model: "gemini-2.0-flash",
    headers: { "Content-Type": "application/json" },
    transformBody: (messages, system) => ({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
    }),
    parseSSE: (line: string) => {
      try {
        const json = JSON.parse(line);
        return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
      } catch { return null; }
    },
  };
}

// ─── OpenRouter (бесплатные модели — :free суффикс, с fallback цепочкой) ─────

const OPENROUTER_FREE_MODELS = [
  "google/gemma-3-27b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-coder:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
];

function openRouterFreeProvider(key: string, model?: string): FreeProviderConfig {
  const m = model ?? OPENROUTER_FREE_MODELS[0];
  return {
    name: "OpenRouter Free",
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: m,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": globalThis.location?.origin ?? "https://mansoni.ru",
    },
    transformBody: (messages, system) => ({
      model: m,
      messages: [{ role: "system", content: system }, ...messages],
      stream: true,
      temperature: 0.7,
      max_tokens: 4096,
    }),
    parseSSE: openaiStyleParse,
  };
}

// ─── HuggingFace Inference (бесплатный tier) ─────────────────────────────────

function hfProvider(token: string): FreeProviderConfig {
  return {
    name: "HuggingFace",
    url: "https://api-inference.huggingface.co/models/meta-llama/Llama-3.3-70B-Instruct/v1/chat/completions",
    model: "Llama-3.3-70B-Instruct",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    transformBody: (messages, system) => ({
      model: "meta-llama/Llama-3.3-70B-Instruct",
      messages: [{ role: "system", content: system }, ...messages],
      stream: true,
      temperature: 0.7,
      max_tokens: 4096,
    }),
    parseSSE: openaiStyleParse,
  };
}

// ─── OpenAI-style SSE chunk parser ───────────────────────────────────────────

function openaiStyleParse(payload: string): string | null {
  try {
    const json = JSON.parse(payload);
    return json?.choices?.[0]?.delta?.content ?? null;
  } catch { return null; }
}

// ─── Авто-определение доступного провайдера ──────────────────────────────────

export function detectFreeProvider(): FreeProviderConfig | null {
  const groqKey = (import.meta.env.VITE_GROQ_API_KEY as string | undefined)?.trim();
  if (groqKey) return groqProvider(groqKey);

  const googleKey = (import.meta.env.VITE_GOOGLE_AI_KEY as string | undefined)?.trim();
  if (googleKey) return googleProvider(googleKey);

  const orKey = (import.meta.env.VITE_OPENROUTER_KEY as string | undefined)?.trim();
  if (orKey) return openRouterFreeProvider(orKey);

  const hfToken = (import.meta.env.VITE_HF_TOKEN as string | undefined)?.trim();
  if (hfToken) return hfProvider(hfToken);

  return null;
}

export function isFreeProviderConfigured(): boolean {
  return detectFreeProvider() !== null;
}

export function getFreeProviderName(): string {
  return detectFreeProvider()?.name ?? "нет";
}

/**
 * SSE стриминг через бесплатный провайдер.
 * Возвращает Response с ReadableStream body.
 */
export async function callFreeProvider(
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
  signal?: AbortSignal,
): Promise<Response> {
  const provider = detectFreeProvider();
  if (!provider) throw new Error("Бесплатный AI провайдер не настроен");

  logger.info(`[ARIA] Используем бесплатный провайдер: ${provider.name} (${provider.model})`);

  const body = provider.transformBody(messages, systemPrompt);

  const resp = await fetch(provider.url, {
    method: "POST",
    headers: provider.headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "");
    throw new Error(`${provider.name} ${resp.status}: ${errBody.slice(0, 200)}`);
  }

  // Для Google Gemini нужна обёртка SSE → OpenAI формат
  if (provider.name === "Google Gemini") {
    return wrapGeminiAsOpenAI(resp);
  }

  return resp;
}

// Google Gemini SSE → OpenAI-совместимый SSE stream
function wrapGeminiAsOpenAI(resp: Response): Response {
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);

        if (line.startsWith("data: ")) line = line.slice(6);
        if (!line || line === "[DONE]") continue;

        try {
          const json = JSON.parse(line);
          const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const chunk = JSON.stringify({
              choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
            });
            controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
          }
        } catch { /* неполный JSON — пропускаем */ }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}
