/**
 * supabase/functions/generate-music/index.ts
 *
 * Edge Function для AI-генерации музыки для Reels.
 * Rate limit: 3 генерации / день на пользователя.
 * Fallback: предустановленная библиотека треков.
 *
 * Request:  POST { mood: string, duration: number, genre?: string }
 * Response: { url: string, title: string, duration: number, mood: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/utils.ts";

const DAILY_LIMIT = 3;

const MOOD_PRESETS: Record<string, { title: string; url: string; duration: number }[]> = {
  happy: [
    { title: "Sunny Vibes", url: "https://cdn.pixabay.com/audio/2024/11/11/audio_4956b4eff1.mp3", duration: 30 },
    { title: "Good Morning", url: "https://cdn.pixabay.com/audio/2024/09/10/audio_6e9b3a7c21.mp3", duration: 25 },
  ],
  sad: [
    { title: "Rainy Thoughts", url: "https://cdn.pixabay.com/audio/2024/10/05/audio_1e2c3b4d5a.mp3", duration: 35 },
    { title: "Melancholy", url: "https://cdn.pixabay.com/audio/2024/08/22/audio_a1b2c3d4e5.mp3", duration: 40 },
  ],
  energetic: [
    { title: "Power Up", url: "https://cdn.pixabay.com/audio/2024/07/15/audio_f1e2d3c4b5.mp3", duration: 20 },
    { title: "Adrenaline Rush", url: "https://cdn.pixabay.com/audio/2024/06/01/audio_abc123def4.mp3", duration: 30 },
  ],
  relaxed: [
    { title: "Ocean Breeze", url: "https://cdn.pixabay.com/audio/2024/05/20/audio_calm_waves01.mp3", duration: 45 },
    { title: "Lo-fi Dreams", url: "https://cdn.pixabay.com/audio/2024/04/10/audio_lofi_chill02.mp3", duration: 60 },
  ],
  dramatic: [
    { title: "Epic Journey", url: "https://cdn.pixabay.com/audio/2024/03/01/audio_epic_cinematic.mp3", duration: 30 },
    { title: "Dark Tension", url: "https://cdn.pixabay.com/audio/2024/02/15/audio_dark_ambient01.mp3", duration: 35 },
  ],
};

const VALID_MOODS = ["happy", "sad", "energetic", "relaxed", "dramatic"] as const;
const VALID_GENRES = ["pop", "lofi", "electronic", "acoustic"] as const;

function pickFallbackTrack(mood: string, duration: number): { url: string; title: string; duration: number; mood: string } {
  const moodKey = VALID_MOODS.includes(mood as typeof VALID_MOODS[number]) ? mood : "happy";
  const tracks = MOOD_PRESETS[moodKey] ?? MOOD_PRESETS.happy;
  // Ближайший по длительности
  const sorted = [...tracks].sort((a, b) => Math.abs(a.duration - duration) - Math.abs(b.duration - duration));
  const picked = sorted[0];
  return { url: picked.url, title: picked.title, duration: picked.duration, mood: moodKey };
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
    const mood = typeof body.mood === "string" ? body.mood.trim().toLowerCase() : "";
    const duration = typeof body.duration === "number" ? Math.min(Math.max(body.duration, 5), 120) : 30;
    const genre = typeof body.genre === "string" ? body.genre.trim().toLowerCase() : undefined;

    if (!mood) {
      return new Response(JSON.stringify({ error: "Поле mood обязательно" }), { status: 400, headers: jsonHeaders });
    }

    // Rate limiting: проверяем количество генераций за сегодня
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { count, error: countError } = await supabase
      .from("edge_rate_limits")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("endpoint", "generate-music")
      .gte("created_at", todayStart.toISOString());

    if (!countError && (count ?? 0) >= DAILY_LIMIT) {
      // Лимит исчерпан — возвращаем fallback трек
      const fallback = pickFallbackTrack(mood, duration);
      return new Response(JSON.stringify({ ...fallback, is_fallback: true }), { status: 200, headers: jsonHeaders });
    }

    // Записываем rate limit
    await supabase.from("edge_rate_limits").insert({
      user_id: user.id,
      endpoint: "generate-music",
    });

    // Пытаемся использовать внешний API (Suno/MusicGen)
    const externalApiKey = Deno.env.get("MUSIC_GEN_API_KEY");
    if (externalApiKey) {
      try {
        const apiUrl = Deno.env.get("MUSIC_GEN_API_URL") ?? "https://api.suno.ai/v1/generate";
        const apiResponse = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${externalApiKey}`,
          },
          body: JSON.stringify({ mood, duration, genre }),
          signal: AbortSignal.timeout(30_000),
        });

        if (apiResponse.ok) {
          const apiData = await apiResponse.json();
          const url = typeof apiData.url === "string" ? apiData.url : "";
          const title = typeof apiData.title === "string" ? apiData.title : `${mood} track`;
          if (url) {
            return new Response(
              JSON.stringify({ url, title, duration, mood, is_fallback: false }),
              { status: 200, headers: jsonHeaders },
            );
          }
        }
      } catch (apiErr) {
        console.error("[generate-music] External API error, using fallback", apiErr);
      }
    }

    // Fallback: предустановленная библиотека
    const fallback = pickFallbackTrack(mood, duration);
    return new Response(
      JSON.stringify({ ...fallback, is_fallback: true }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (e) {
    console.error("[generate-music] Unexpected error:", e);
    return new Response(
      JSON.stringify({ error: "Внутренняя ошибка сервера" }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
