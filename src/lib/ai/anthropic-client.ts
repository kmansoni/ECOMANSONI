/**
 * Anthropic Claude API client for client-side.
 * ⚠️  SECURITY: Uses Supabase Edge Function (aria-anthropic).
 * API key is stored securely in Supabase Vault — never exposed to client.
 * Setup: Store ANTHROPIC_API_KEY in Supabase Dashboard → Settings → Vault
 */

import { supabase } from "@/integrations/supabase/client";

export interface AnthropicMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AnthropicStreamChunk {
  type: string;
  delta?: {
    type: string;
    text?: string;
  };
}

// Use Supabase Edge Function for secure API key handling
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const EDGE_FUNCTION_URL = SUPABASE_URL
  ? `${SUPABASE_URL}/functions/v1/aria-anthropic`
  : "";

export function getAnthropicConfig() {
  // Конфигурация модели/токенов — кастомизация через env vars.
  // API-ключ хранится ТОЛЬКО в Supabase Vault (серверная сторона).
  const model =
    (import.meta.env.VITE_ANTHROPIC_MODEL as string | undefined)?.trim() ||
    "claude-opus-4-6";

  const maxTokens = parseInt(
    (import.meta.env.VITE_ANTHROPIC_MAX_TOKENS as string | undefined)?.trim() ||
      "2000",
    10
  );

  return { model, maxTokens };
}

export function isAnthropicConfigured(): boolean {
  // Фича-флаг: Anthropic Claude через Edge Function включён.
  // Реальный API-ключ хранится в Supabase Vault — НЕ на клиенте.
  const enabled = (import.meta.env.VITE_ANTHROPIC_ENABLED as string | undefined)?.trim();
  return !!enabled && enabled !== "false" && enabled !== "0";
}

/**
 * Call Anthropic via Edge Function with streaming response.
 * API key is stored securely in Supabase Vault.
 */
export async function callAnthropicStreaming(
  messages: AnthropicMessage[],
  systemPrompt: string,
  onChunk?: (text: string) => void
): Promise<string> {
  if (!EDGE_FUNCTION_URL) {
    throw new Error("[Anthropic] Edge Function URL not configured. Check VITE_SUPABASE_URL");
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  // Get current config for model/max_tokens
  const { model, maxTokens } = getAnthropicConfig();

  const anthropicMessages: AnthropicMessage[] = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  const response = await fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Send access token for auth (optional, depends on RLS)
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      messages: anthropicMessages,
      model,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    const errorData = (() => {
      try {
        return JSON.parse(errorText);
      } catch {
        return { error: errorText };
      }
    })();

    const errorMsg = errorData?.error?.message ?? errorData?.error ?? errorText;
    throw new Error(`[Anthropic Edge Function] ${response.status}: ${errorMsg}`);
  }

  if (!response.body) {
    throw new Error("[Anthropic] Empty response body");
  }

  let fullText = "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        try {
          const parsed = JSON.parse(jsonStr);

          // Already in OpenAI format from Edge Function
          if (parsed.choices?.[0]?.delta?.content) {
            fullText += parsed.choices[0].delta.content;
            onChunk?.(parsed.choices[0].delta.content);
          }
        } catch (e) {
          // Ignore JSON parsing errors for individual chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!fullText.trim()) {
    throw new Error("[Anthropic] Empty response received");
  }

  return fullText;
}
