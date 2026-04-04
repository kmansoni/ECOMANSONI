import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/utils.ts";

interface AnthropicMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface RequestBody {
  messages: AnthropicMessage[];
  system?: string;
  model?: string;
  max_tokens?: number;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // JWT — обязательна авторизация
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Требуется авторизация" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { error: authError } = await userClient.auth.getUser();
  if (authError) {
    return new Response(JSON.stringify({ error: "Неверный токен" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "AI-сервис временно недоступен" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body = (await req.json()) as RequestBody;
    const {
      messages,
      system = "",
      model = "claude-opus-4-6",
      max_tokens = 2000,
    } = body;

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Требуется массив messages" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Convert legacy system field to messages list for Anthropic v1/messages compatibility
    const anthropicMessages: AnthropicMessage[] = system
      ? [{ role: "system", content: system }, ...messages]
      : messages;

    // Call Anthropic API
    const anthropicResponse = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens,
          messages: anthropicMessages,
          stream: true,
        }),
      }
    );

    if (!anthropicResponse.ok) {
      const errBody = await anthropicResponse.text();
      console.error("[aria-anthropic] Anthropic API error:", errBody);
      return new Response(
        JSON.stringify({ error: "Ошибка AI-сервиса" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const reader = anthropicResponse.body?.getReader();
    if (!reader) {
      return new Response(JSON.stringify({ error: "Пустой ответ от AI" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert Anthropic stream to SSE format
    const transformedStream = new ReadableStream({
      async start(controller) {
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

                // Convert to OpenAI format for client compatibility
                if (
                  parsed.type === "content_block_delta" &&
                  parsed.delta?.text
                ) {
                  const openaiChunk = {
                    id: `chatcmpl-${Date.now()}`,
                    object: "chat.completion.chunk",
                    created: Math.floor(Date.now() / 1000),
                    model,
                    choices: [
                      {
                        index: 0,
                        delta: { content: parsed.delta.text },
                        finish_reason: null,
                      },
                    ],
                  };
                  controller.enqueue(
                    new TextEncoder().encode(
                      `data: ${JSON.stringify(openaiChunk)}\n\n`
                    )
                  );
                } else if (parsed.type === "message_stop") {
                  // Send finish event
                  const finishChunk = {
                    id: `chatcmpl-${Date.now()}`,
                    object: "chat.completion.chunk",
                    created: Math.floor(Date.now() / 1000),
                    model,
                    choices: [
                      {
                        index: 0,
                        delta: {},
                        finish_reason: "stop",
                      },
                    ],
                  };
                  controller.enqueue(
                    new TextEncoder().encode(
                      `data: ${JSON.stringify(finishChunk)}\n\n`
                    )
                  );
                  controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
                }
              } catch (e) {
                console.error("[aria-anthropic] JSON parse error:", e);
              }
            }
          }
        } catch (e) {
          console.error("[aria-anthropic] Stream error:", e);
          controller.error(e);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(transformedStream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[aria-anthropic] Error:", err);
    return new Response(JSON.stringify({ error: "Внутренняя ошибка сервиса" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
