/**
 * supabase/functions/suggest-hashtags/index.ts
 *
 * Edge Function для AI-подбора хэштегов по тексту описания поста.
 * Если OPENAI_API_KEY задан — использует GPT для генерации.
 * Иначе — rule-based fallback: извлечение ключевых слов из текста.
 *
 * Request: POST { caption: string, imageDescription?: string }
 * Response: { hashtags: string[] }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/utils.ts";

const MAX_CAPTION_LENGTH = 4096;
const MAX_HASHTAGS = 30;
const MIN_CAPTION_LENGTH = 3;

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
    const caption = typeof body.caption === "string" ? body.caption.trim() : "";
    const imageDescription = typeof body.imageDescription === "string" ? body.imageDescription.trim() : "";

    if (caption.length < MIN_CAPTION_LENGTH) {
      return new Response(
        JSON.stringify({ error: "Описание слишком короткое (минимум 3 символа)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (caption.length > MAX_CAPTION_LENGTH) {
      return new Response(
        JSON.stringify({ error: "Описание слишком длинное (максимум 4096 символов)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    let hashtags: string[];

    if (openaiKey) {
      hashtags = await generateWithAI(caption, imageDescription, openaiKey);
    } else {
      hashtags = extractKeywordHashtags(caption, imageDescription);
    }

    return new Response(JSON.stringify({ hashtags: hashtags.slice(0, MAX_HASHTAGS) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[suggest-hashtags] Ошибка:", err);
    return new Response(JSON.stringify({ error: "Внутренняя ошибка сервера" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function generateWithAI(
  caption: string,
  imageDescription: string,
  apiKey: string,
): Promise<string[]> {
  const systemPrompt =
    "Ты — помощник по подбору хэштегов для социальной сети. " +
    "Пользователь даёт описание поста, а ты возвращаешь только JSON-массив хэштегов (без символа #). " +
    "Используй русские и английские хэштеги. Максимум 30 штук. " +
    'Возвращай ТОЛЬКО валидный JSON-массив строк, например: ["природа","travel","sunset"]';

  const userPrompt = imageDescription
    ? `Описание поста: ${caption}\nОписание изображения: ${imageDescription}`
    : `Описание поста: ${caption}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    console.error("[suggest-hashtags] OpenAI API ошибка:", response.status);
    return extractKeywordHashtags(caption, imageDescription);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content ?? "";

  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((h: unknown): h is string => typeof h === "string" && h.length > 0)
        .map((h) => h.replace(/^#/, "").trim())
        .filter((h) => h.length > 0 && h.length <= 50);
    }
  } catch {
    console.error("[suggest-hashtags] Не удалось распарсить ответ AI:", content);
  }

  return extractKeywordHashtags(caption, imageDescription);
}

function extractKeywordHashtags(caption: string, imageDescription: string): string[] {
  const combinedText = `${caption} ${imageDescription}`.toLowerCase();

  // Извлечение уже имеющихся хэштегов
  const existingHashtags = combinedText.match(/#([a-zа-яё0-9_]+)/gi) ?? [];
  const existing = existingHashtags.map((h) => h.replace(/^#/, ""));

  // Извлечение ключевых слов (3+ символа, не предлоги/союзы)
  const stopWords = new Set([
    "для", "это", "что", "как", "при", "все", "его", "она",
    "они", "мой", "моя", "моё", "мне", "мои", "вас", "вам",
    "нас", "нам", "тут", "там", "вот", "уже", "ещё", "или",
    "the", "and", "for", "this", "that", "with", "from", "are",
    "was", "were", "been", "have", "has", "had", "not", "but",
  ]);

  const words = combinedText
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));

  // Частотный анализ
  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }

  const keywords = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);

  const allTags = [...new Set([...existing, ...keywords])];
  return allTags.slice(0, MAX_HASHTAGS);
}
