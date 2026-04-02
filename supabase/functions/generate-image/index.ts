/**
 * supabase/functions/generate-image/index.ts
 *
 * Edge Function для AI-генерации изображений через OpenAI DALL-E 3.
 * Rate limit: 5 генераций / час на пользователя.
 *
 * Request:  POST { prompt: string, style?: string, size?: '256'|'512'|'1024' }
 * Response: { url: string, revisedPrompt: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/utils.ts";

const RATE_LIMIT_PER_HOUR = 5;
const MAX_PROMPT_LENGTH = 1000;
const ALLOWED_SIZES = ["256", "512", "1024"] as const;
const ALLOWED_STYLES = ["vivid", "natural"] as const;

const STYLE_MAP: Record<string, string> = {
  "Реалистичный": "natural",
  "Аниме": "vivid",
  "Арт": "vivid",
  "3D": "vivid",
};

function mapStyle(input: string | undefined): "vivid" | "natural" {
  if (!input) return "vivid";
  if (ALLOWED_STYLES.includes(input as typeof ALLOWED_STYLES[number])) {
    return input as "vivid" | "natural";
  }
  return (STYLE_MAP[input] as "vivid" | "natural") ?? "vivid";
}

function mapSize(input: string | undefined): string {
  if (input === "256") return "256x256";
  if (input === "512") return "512x512";
  return "1024x1024";
}

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
    const style = typeof body.style === "string" ? body.style : undefined;
    const size = typeof body.size === "string" ? body.size : undefined;

    if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Промпт обязателен (макс. ${MAX_PROMPT_LENGTH} символов)` }),
        { status: 400, headers: jsonHeaders },
      );
    }

    if (size && !ALLOWED_SIZES.includes(size as typeof ALLOWED_SIZES[number])) {
      return new Response(
        JSON.stringify({ error: "Допустимые размеры: 256, 512, 1024" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    // Rate limiting: проверяем кол-во генераций за последний час
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const adminClient = createClient(supabaseUrl, serviceKey);

    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { count, error: countError } = await adminClient
      .from("ai_image_generations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", oneHourAgo);

    if (countError) {
      // Таблица может не существовать — пропускаем rate limit
      console.error("[generate-image] Rate limit check failed:", countError.message);
    } else if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
      return new Response(
        JSON.stringify({ error: "Лимит генераций: 5 в час. Попробуйте позже." }),
        { status: 429, headers: jsonHeaders },
      );
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "Сервис генерации изображений временно недоступен" }),
        { status: 503, headers: jsonHeaders },
      );
    }

    const dalleResponse = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: mapSize(size),
        style: mapStyle(style),
        response_format: "url",
      }),
    });

    if (!dalleResponse.ok) {
      const errBody = await dalleResponse.text();
      console.error("[generate-image] DALL-E error:", dalleResponse.status, errBody);
      return new Response(
        JSON.stringify({ error: "Не удалось сгенерировать изображение" }),
        { status: 502, headers: jsonHeaders },
      );
    }

    const dalleData = await dalleResponse.json();
    const imageData = dalleData?.data?.[0];
    const url = imageData?.url ?? "";
    const revisedPrompt = imageData?.revised_prompt ?? prompt;

    if (!url) {
      return new Response(
        JSON.stringify({ error: "Пустой ответ от DALL-E" }),
        { status: 502, headers: jsonHeaders },
      );
    }

    // Записываем генерацию для rate limiting (best-effort)
    await adminClient
      .from("ai_image_generations")
      .insert({ user_id: user.id, prompt, image_url: url })
      .then(({ error: insertErr }) => {
        if (insertErr) console.error("[generate-image] Log insert failed:", insertErr.message);
      });

    return new Response(
      JSON.stringify({ url, revisedPrompt }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (err) {
    console.error("[generate-image] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Внутренняя ошибка сервера" }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
