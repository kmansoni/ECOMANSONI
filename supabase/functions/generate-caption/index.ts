/**
 * supabase/functions/generate-caption/index.ts
 *
 * Edge Function для AI-генерации подписей к постам.
 * Использует OpenAI GPT для генерации caption.
 * Rate limit: 20 генераций / день.
 *
 * Request:  POST { image_url?: string, context?: string, style?: string }
 * Response: { caption: string, style: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/utils.ts";

const DAILY_LIMIT = 20;
const MAX_CONTEXT_LENGTH = 500;

const STYLE_PROMPTS: Record<string, string> = {
  casual: "Напиши непринуждённую, дружелюбную подпись к посту в социальной сети. Используй эмодзи. Максимум 2-3 предложения.",
  professional: "Напиши профессиональную, деловую подпись к посту. Без лишних эмодзи. Максимум 2-3 предложения.",
  funny: "Напиши смешную, ироничную подпись к посту. Используй юмор и эмодзи. Максимум 2-3 предложения.",
  inspirational: "Напиши вдохновляющую, мотивирующую подпись к посту. Максимум 2-3 предложения.",
};

const VALID_STYLES = Object.keys(STYLE_PROMPTS);

const FALLBACK_CAPTIONS: Record<string, string[]> = {
  casual: [
    "Просто ловлю момент ✨",
    "Хороший день для хорошего настроения 🌞",
    "Жизнь прекрасна, когда ты в моменте 💫",
  ],
  professional: [
    "Новые горизонты, новые возможности.",
    "Путь к цели начинается с первого шага.",
    "Результат говорит сам за себя.",
  ],
  funny: [
    "Мама сказала, что я особенный 😂",
    "Фильтры? Какие фильтры? Это мой естественный свет 💡",
    "Кофе — мой план на жизнь ☕",
  ],
  inspirational: [
    "Каждый день — новая возможность стать лучше 🌟",
    "Мечтай. Действуй. Достигай. 🚀",
    "Сила не в том, чтобы никогда не падать, а в том, чтобы подниматься каждый раз 💪",
  ],
};

function pickFallback(style: string): string {
  const pool = FALLBACK_CAPTIONS[style] ?? FALLBACK_CAPTIONS.casual;
  return pool[Math.floor(Math.random() * pool.length)];
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Метод не поддерживается" }), { status: 405, headers: jsonHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Требуется авторизация" }), { status: 401, headers: jsonHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Неверный токен авторизации" }), { status: 401, headers: jsonHeaders });
  }

  try {
    const body = await req.json();
    const imageUrl = typeof body.image_url === "string" ? body.image_url.trim() : undefined;
    const context = typeof body.context === "string" ? body.context.trim().slice(0, MAX_CONTEXT_LENGTH) : undefined;
    const style = typeof body.style === "string" && VALID_STYLES.includes(body.style) ? body.style : "casual";

    // Rate limiting
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { count, error: countError } = await supabase
      .from("edge_rate_limits")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("endpoint", "generate-caption")
      .gte("created_at", todayStart.toISOString());

    if (!countError && (count ?? 0) >= DAILY_LIMIT) {
      return new Response(
        JSON.stringify({ caption: pickFallback(style), style, is_fallback: true }),
        { status: 200, headers: jsonHeaders },
      );
    }

    // Записываем rate limit
    await supabase.from("edge_rate_limits").insert({
      user_id: user.id,
      endpoint: "generate-caption",
    });

    // Пытаемся сгенерировать через OpenAI
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (openaiKey) {
      try {
        const systemPrompt = STYLE_PROMPTS[style];
        let userPrompt = "Сгенерируй подпись к посту в социальной сети.";
        if (context) userPrompt += ` Контекст: ${context}`;
        if (imageUrl) userPrompt += ` К посту приложено изображение.`;

        const apiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            max_tokens: 200,
            temperature: 0.8,
          }),
          signal: AbortSignal.timeout(15_000),
        });

        if (apiResponse.ok) {
          const apiData = await apiResponse.json();
          const caption = apiData.choices?.[0]?.message?.content?.trim();
          if (caption) {
            return new Response(
              JSON.stringify({ caption, style, is_fallback: false }),
              { status: 200, headers: jsonHeaders },
            );
          }
        }
      } catch (apiErr) {
        console.error("[generate-caption] OpenAI API error, using fallback", apiErr);
      }
    }

    // Fallback
    return new Response(
      JSON.stringify({ caption: pickFallback(style), style, is_fallback: true }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (e) {
    console.error("[generate-caption] Unexpected error:", e);
    return new Response(
      JSON.stringify({ error: "Внутренняя ошибка сервера" }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
