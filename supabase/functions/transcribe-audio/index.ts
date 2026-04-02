/**
 * supabase/functions/transcribe-audio/index.ts
 *
 * Edge Function для транскрипции аудиофайлов через OpenAI Whisper API.
 * Принимает FormData с audio file, возвращает { text, language, confidence }.
 * Если OPENAI_API_KEY не задан — 501 Not Implemented.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/utils.ts";

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25 MB — лимит Whisper API

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

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Невалидный токен" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Проверяем наличие OpenAI API ключа
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiApiKey) {
    return new Response(JSON.stringify({ error: "Транскрипция не настроена на сервере" }), {
      status: 501,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio");

    if (!(audioFile instanceof File)) {
      return new Response(JSON.stringify({ error: "Поле 'audio' обязательно (File)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (audioFile.size > MAX_AUDIO_SIZE) {
      return new Response(JSON.stringify({ error: "Файл слишком большой (макс. 25 МБ)" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lang = formData.get("language");
    const whisperFormData = new FormData();
    whisperFormData.append("file", audioFile, audioFile.name || "audio.webm");
    whisperFormData.append("model", "whisper-1");
    whisperFormData.append("response_format", "verbose_json");
    if (typeof lang === "string" && lang.length >= 2) {
      whisperFormData.append("language", lang.slice(0, 2));
    }

    const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: whisperFormData,
    });

    if (!whisperResponse.ok) {
      const errorBody = await whisperResponse.text();
      console.error("[transcribe-audio] Whisper API error:", whisperResponse.status, errorBody);
      return new Response(JSON.stringify({ error: "Ошибка сервиса транскрипции" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await whisperResponse.json();

    return new Response(
      JSON.stringify({
        text: result.text ?? "",
        language: result.language ?? "unknown",
        confidence: typeof result.segments?.[0]?.avg_logprob === "number"
          ? Math.max(0, Math.min(1, 1 + result.segments[0].avg_logprob))
          : 0.8,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[transcribe-audio] Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Внутренняя ошибка сервера" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
