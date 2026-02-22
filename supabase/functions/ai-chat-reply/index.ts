// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import {
  handleCors,
  getCorsHeaders,
  checkRateLimit,
  getClientId,
  rateLimitResponse,
  errorResponse,
} from "../_shared/utils.ts";

const DEFAULT_OWNER_USER_ID = "c8e6756f-a17c-48b0-abf1-77d8f942bfc8";
const DEFAULT_ASSISTANT_EMAIL = "ai.assistant@mansoni.bot";

// Authorization model:
// - Caller must be authenticated
// - Caller must be a participant of the conversation
// This allows AI chat for all users without exposing other conversations.

const systemPrompt = `Ты — AI-помощник внутри веб-мессенджера mansoni.

Правила:
- Отвечай на русском.
- Будь кратким и практичным.
- Пользователь — владелец проекта и просит изменения в коде. Давай конкретные шаги/патчи.
- Не утверждай, что ты уже внёс изменения в его репозиторий (если это не произошло в IDE).
- Если не хватает контекста — задай 1-2 уточняющих вопроса.
`;

type ChatRole = "user" | "assistant";

type OpenAIChatMessage = { role: ChatRole | "system"; content: string };

function toJsonResponse(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function resolveAssistantUserId(admin: ReturnType<typeof createClient>): Promise<string> {
  const configured = Deno.env.get("AI_ASSISTANT_USER_ID");
  if (configured) return configured;

  const assistantEmail = Deno.env.get("AI_ASSISTANT_EMAIL") || DEFAULT_ASSISTANT_EMAIL;
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = (data?.users || []).find((u) => (u.email || "").toLowerCase() === assistantEmail.toLowerCase());
  if (!existing?.id) {
    throw new Error("AI assistant user is not provisioned. Call ensure-ai-assistant first.");
  }
  return existing.id;
}

function parseDeltaFromSseLine(line: string): string {
  if (!line.startsWith("data: ")) return "";
  const jsonStr = line.slice(6).trim();
  if (!jsonStr || jsonStr === "[DONE]") return "";
  try {
    const parsed: any = JSON.parse(jsonStr);
    return String(parsed?.choices?.[0]?.delta?.content ?? "");
  } catch {
    return "";
  }
}

function getProvider(): string {
  return String(Deno.env.get("AI_PROVIDER") || "openai_compat").toLowerCase();
}

function getBaseUrl(): string {
  const p = getProvider();
  return Deno.env.get("AI_BASE_URL") || (p === "anthropic" ? "https://api.anthropic.com/v1" : "https://api.mansoni.ru/v1");
}

function getModel(): string {
  const p = getProvider();
  return Deno.env.get("AI_MODEL") || (p === "anthropic" ? "claude-3-7-sonnet-latest" : "google/gemini-3-flash-preview");
}

function openAiSseLine(delta: string): Uint8Array {
  const enc = new TextEncoder();
  const obj = {
    id: crypto.randomUUID(),
    object: "chat.completion.chunk",
    choices: [{ index: 0, delta: { content: delta } }],
  };
  return enc.encode(`data: ${JSON.stringify(obj)}\n\n`);
}

function openAiSseDone(): Uint8Array {
  const enc = new TextEncoder();
  return enc.encode("data: [DONE]\n\n");
}

function anthropicDeltaFromEvent(eventName: string, data: any): string {
  if (eventName === "content_block_delta") {
    const t = data?.delta?.text;
    return typeof t === "string" ? t : "";
  }
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

async function callAiNonStream({ apiKey, system, messages }: { apiKey: string; system: string; messages: OpenAIChatMessage[] }): Promise<string> {
  const provider = getProvider();
  const baseUrl = getBaseUrl();
  const model = getModel();

  if (provider === "anthropic") {
    const url = `${baseUrl.replace(/\/$/, "")}/messages`;
    const nonSystem = messages.filter((m) => m.role === "user" || m.role === "assistant");
    const anthropicMsgs = nonSystem.map((m) => ({
      role: m.role,
      content: [{ type: "text", text: String(m.content ?? "") }],
    }));

    const resp = await fetch(url, {
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
        max_tokens: Number(Deno.env.get("AI_MAX_TOKENS") || 2000),
        temperature: 0.2,
        stream: false,
      }),
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(`AI error ${resp.status}: ${t}`);
    }

    const json: any = await resp.json().catch(() => null);
    const blocks = Array.isArray(json?.content) ? json.content : [];
    const text = blocks.map((b: any) => String(b?.text ?? "")).join("");
    return text.trim();
  }

  // OpenAI-compatible
  const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, ...(messages ?? [])],
      stream: false,
    }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`AI error ${resp.status}: ${t}`);
  }
  const json: any = await resp.json().catch(() => null);
  const content = json?.choices?.[0]?.message?.content ?? "";
  return String(content || "").trim();
}

Deno.serve(async (req) => {
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return errorResponse("Server not configured", 500, origin);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return errorResponse("Missing Authorization header", 401, origin);
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const conversationId = (body as any)?.conversation_id as string | undefined;
    const stream = !!(body as any)?.stream;
    if (!conversationId) {
      return errorResponse("conversation_id is required", 400, origin);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return errorResponse(userErr?.message || "Invalid token", 401, origin);
    }

    // Safety: caller must be a participant of the conversation.
    const { data: partRow, error: partErr } = await admin
      .from("conversation_participants")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (partErr) {
      return errorResponse(partErr.message, 500, origin);
    }
    if (!partRow?.id) {
      return errorResponse("Forbidden", 403, origin);
    }

    const assistantUserId = await resolveAssistantUserId(admin);

    // Load recent messages for context (last 30)
    const { data: rows, error: msgErr } = await admin
      .from("messages")
      .select("sender_id, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (msgErr) {
      return errorResponse(msgErr.message, 500, origin);
    }

    const ordered = (rows || []).slice().reverse();

    const chat: OpenAIChatMessage[] = [{ role: "system", content: systemPrompt }];
    for (const m of ordered) {
      const senderId = (m as any).sender_id as string;
      const content = String((m as any).content ?? "").trim();
      if (!content) continue;

      if (senderId === assistantUserId) {
        chat.push({ role: "assistant", content });
      } else {
        // Treat everything else as user (owner)
        chat.push({ role: "user", content });
      }
    }

    const AI_API_KEY = Deno.env.get("AI_API_KEY");
    if (!AI_API_KEY) {
      return errorResponse("AI_API_KEY is not configured", 500, origin);
    }

    if (!stream) {
      const finalText = await callAiNonStream({ apiKey: AI_API_KEY, system: systemPrompt, messages: chat as any });
      if (!finalText) return errorResponse("Empty AI response", 502, origin);

      const { data: inserted, error: insErr } = await admin
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: assistantUserId,
          content: finalText,
          is_read: false,
        })
        .select("id")
        .single();

      if (insErr) return errorResponse(insErr.message, 500, origin);

      return toJsonResponse(
        {
          ok: true,
          message_id: inserted?.id,
          content: finalText,
        },
        200,
        {
          ...corsHeaders,
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      );
    }

    const provider = getProvider();
    const baseUrl = getBaseUrl();
    const model = getModel();

    let assistantText = "";

    if (provider === "anthropic") {
      const url = `${baseUrl.replace(/\/$/, "")}/messages`;
      const nonSystem = (chat as any[]).filter((m) => m.role === "user" || m.role === "assistant");
      const anthropicMsgs = nonSystem.map((m) => ({
        role: m.role,
        content: [{ type: "text", text: String(m.content ?? "") }],
      }));

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "x-api-key": AI_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          system: systemPrompt,
          messages: anthropicMsgs,
          max_tokens: Number(Deno.env.get("AI_MAX_TOKENS") || 1800),
          temperature: 0.2,
          stream: true,
        }),
      });

      if (!resp.ok) {
        const t = await resp.text().catch(() => "");
        console.error("ai-chat-reply anthropic error:", resp.status, t);
        return errorResponse("AI error", 502, origin);
      }

      const reader = resp.body?.getReader();
      if (!reader) return errorResponse("No stream body", 502, origin);
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      const sseStream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          const { done, value } = await reader.read();
          if (done) {
            const final = assistantText.trim();
            if (final) {
              try {
                await admin.from("messages").insert({
                  conversation_id: conversationId,
                  sender_id: assistantUserId,
                  content: final,
                  is_read: false,
                });
              } catch (e) {
                console.error("ai-chat-reply: insert final failed", e);
              }
            }
            controller.enqueue(openAiSseDone());
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
              // Insert will happen when stream closes; but try now as well.
              const final = assistantText.trim();
              if (final) {
                try {
                  await admin.from("messages").insert({
                    conversation_id: conversationId,
                    sender_id: assistantUserId,
                    content: final,
                    is_read: false,
                  });
                } catch (e) {
                  console.error("ai-chat-reply: insert final failed", e);
                }
              }
              controller.enqueue(openAiSseDone());
              controller.close();
              try { await reader.cancel(); } catch {}
              return;
            }

            const delta = anthropicDeltaFromEvent(currentEvent, data);
            if (delta) {
              assistantText += delta;
              controller.enqueue(openAiSseLine(delta));
            }
          }
        },
        async cancel() {
          try { await reader.cancel(); } catch {}
        },
      });

      return new Response(sseStream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      });
    }

    // OpenAI-compatible streaming
    const aiResp = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...(chat ?? [])],
        stream: true,
      }),
    });

    if (!aiResp.ok) {
      const errorText = await aiResp.text().catch(() => "");
      console.error("ai-chat-reply upstream error:", aiResp.status, errorText);
      return errorResponse("AI error", 502, origin);
    }

    const upstreamReader = aiResp.body?.getReader();
    if (!upstreamReader) return errorResponse("No stream body", 502, origin);
    const decoder = new TextDecoder();
    let buffer = "";

    const sseStream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { done, value } = await upstreamReader.read();
        if (done) {
          const finalText = assistantText.trim();
          if (finalText) {
            try {
              await admin.from("messages").insert({
                conversation_id: conversationId,
                sender_id: assistantUserId,
                content: finalText,
                is_read: false,
              });
            } catch (e) {
              console.error("ai-chat-reply: failed to insert final message", e);
            }
          }
          controller.close();
          return;
        }

        controller.enqueue(value);

        buffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line) continue;
          const delta = parseDeltaFromSseLine(line);
          if (delta) assistantText += delta;
        }
      },
      async cancel() {
        try {
          await upstreamReader.cancel();
        } catch {
          // ignore
        }
      },
    });

    return new Response(sseStream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-RateLimit-Remaining": String(rateLimit.remaining),
      },
    });
  } catch (e) {
    console.error("ai-chat-reply error:", e);
    return toJsonResponse({ error: e instanceof Error ? e.message : "Error" }, 500, corsHeaders);
  }
});
