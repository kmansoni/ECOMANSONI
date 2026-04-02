/**
 * supabase/functions/generate-sticker/index.ts
 *
 * Edge Function для AI-генерации стикеров через DALL-E 3.
 * Генерирует мультяшный стикер на белом фоне по описанию.
 *
 * Request:  POST { prompt: string }
 * Response: { url: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/utils.ts";

const MAX_PROMPT_LENGTH = 300;
const STICKER_SYSTEM_PREFIX =
  "A cute sticker of ";
const STICKER_SYSTEM_SUFFIX =
  ". White background, cartoon style, no text, simple outline, high quality, centered composition";

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Метод не поддерживается" }),
      { status: 405, headers: jsonHeaders },
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Требуется авторизация" }),
      { status: 401, headers: jsonHeaders },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: "Неверный токен авторизации" }),
      { status: 401, headers: jsonHeaders },
    );
  }

  try {
    const body = await req.json();
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

    if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Промпт обязателен (макс. ${MAX_PROMPT_LENGTH} символов)` }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "Сервис генерации стикеров временно недоступен" }),
        { status: 503, headers: jsonHeaders },
      );
    }

    const fullPrompt = `${STICKER_SYSTEM_PREFIX}${prompt}${STICKER_SYSTEM_SUFFIX}`;

    const dalleResponse = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: fullPrompt,
        n: 1,
        size: "1024x1024",
        style: "vivid",
        response_format: "url",
      }),
    });

    if (!dalleResponse.ok) {
      const errBody = await dalleResponse.text();
      console.error("[generate-sticker] DALL-E error:", dalleResponse.status, errBody);
      return new Response(
        JSON.stringify({ error: "Не удалось сгенерировать стикер" }),
        { status: 502, headers: jsonHeaders },
      );
    }

    const dalleData = await dalleResponse.json();
    const url = dalleData?.data?.[0]?.url ?? "";

    if (!url) {
      return new Response(
        JSON.stringify({ error: "Пустой ответ от DALL-E" }),
        { status: 502, headers: jsonHeaders },
      );
    }

    return new Response(
      JSON.stringify({ url }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (err) {
    console.error("[generate-sticker] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Внутренняя ошибка сервера" }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
