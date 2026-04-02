/**
 * supabase/functions/generate-alt-text/index.ts
 *
 * Edge Function для AI-генерации alt text (описания для screen reader) по URL изображения.
 * Если OPENAI_API_KEY задан — использует GPT-4o vision.
 * Иначе — возвращает generic описание.
 *
 * Request: POST { imageUrl: string }
 * Response: { altText: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/utils.ts";

const MAX_ALT_TEXT_LENGTH = 1000;

Deno.serve(async (req) => {
  // CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Метод не поддерживается" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Требуется авторизация" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Неверный токен авторизации" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: "Параметр imageUrl обязателен" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Простая проверка URL
    try {
      new URL(imageUrl);
    } catch {
      return new Response(
        JSON.stringify({ error: "Некорректный URL изображения" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    let altText: string;

    if (openaiKey) {
      altText = await generateWithVision(imageUrl, openaiKey);
    } else {
      altText = "Изображение, загруженное пользователем";
    }

    return new Response(
      JSON.stringify({ altText: altText.slice(0, MAX_ALT_TEXT_LENGTH) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[generate-alt-text] Ошибка:", err);
    return new Response(JSON.stringify({ error: "Внутренняя ошибка сервера" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function generateWithVision(imageUrl: string, apiKey: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Ты — помощник по accessibility. Описывай изображения кратко и информативно для screen reader. " +
            "Пиши на русском языке. Описание должно быть 1-3 предложения, до 200 символов. " +
            "Не начинай с 'На изображении'. Просто опиши что видно.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Опиши это изображение для alt text:" },
            { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
          ],
        },
      ],
      temperature: 0.3,
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    console.error("[generate-alt-text] OpenAI API ошибка:", response.status);
    return "Изображение, загруженное пользователем";
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  return content.trim() || "Изображение, загруженное пользователем";
}
