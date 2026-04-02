/**
 * src/lib/audio/speechToText.ts — Сервис транскрипции голосовых сообщений.
 *
 * Стратегия:
 *  1. Primary: Supabase Edge Function 'transcribe-audio' (OpenAI Whisper API)
 *  2. Fallback: Web Speech API (bestjeffort, поддерживается в Chrome/Edge)
 */

import { supabase, SUPABASE_URL } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language: string;
}

/**
 * Загружает аудиофайл по URL и возвращает Blob.
 */
async function fetchAudioBlob(audioUrl: string): Promise<Blob> {
  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`Ошибка загрузки аудио: ${response.status}`);
  }
  return response.blob();
}

/**
 * Транскрибирует аудио через Supabase Edge Function (Whisper API).
 * Возвращает null если сервис недоступен (501) — для fallback.
 */
async function transcribeViaEdgeFunction(
  audioBlob: Blob,
  lang?: string,
): Promise<TranscriptionResult | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Требуется авторизация для транскрипции");
  }

  const formData = new FormData();
  formData.append("audio", audioBlob, "audio.webm");
  if (lang) {
    formData.append("language", lang);
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/transcribe-audio`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: formData,
  });

  if (response.status === 501) {
    // Сервис не настроен — переключаемся на fallback
    return null;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Неизвестная ошибка" }));
    throw new Error(
      (body as { error?: string }).error ?? `Ошибка транскрипции: ${response.status}`,
    );
  }

  return (await response.json()) as TranscriptionResult;
}

/**
 * Проверяет доступность Web Speech API.
 */
export function isWebSpeechSupported(): boolean {
  return typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
}

/**
 * Транскрибирует аудио по URL.
 * Сначала пробует серверную транскрипцию, затем — Web Speech API.
 */
export async function transcribeAudioUrl(
  audioUrl: string,
  lang?: string,
): Promise<TranscriptionResult> {
  const audioBlob = await fetchAudioBlob(audioUrl);

  // Стратегия 1: серверная транскрипция
  try {
    const serverResult = await transcribeViaEdgeFunction(audioBlob, lang);
    if (serverResult) return serverResult;
  } catch (err) {
    logger.warn("[speechToText] Edge Function недоступна, используем fallback", { error: err });
  }

  // Стратегия 2: Web Speech API (best-effort)
  if (!isWebSpeechSupported()) {
    throw new Error("Расшифровка недоступна: сервер не настроен, браузер не поддерживает STT");
  }

  return transcribeViaWebSpeech(lang ?? "ru-RU");
}

/**
 * Транскрипция через Web Speech API (микрофон, best-effort).
 */
function transcribeViaWebSpeech(lang: string): Promise<TranscriptionResult> {
  return new Promise((resolve, reject) => {
    const SpeechRecognitionCtor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition }).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      reject(new Error("SpeechRecognition не поддерживается"));
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    let fullText = "";
    let bestConfidence = 0;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          fullText += event.results[i][0].transcript + " ";
          bestConfidence = Math.max(bestConfidence, event.results[i][0].confidence);
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      reject(new Error(`Ошибка распознавания: ${event.error}`));
    };

    recognition.onend = () => {
      const trimmed = fullText.trim();
      if (trimmed) {
        resolve({ text: trimmed, confidence: bestConfidence, language: lang });
      } else {
        reject(new Error("Не удалось распознать речь"));
      }
    };

    try {
      recognition.start();
      // Автоматическое завершение через 60 секунд
      setTimeout(() => {
        try { recognition.stop(); } catch (stopErr) {
          logger.debug("[speechToText] recognition.stop() уже остановлен", { error: stopErr });
        }
      }, 60_000);
    } catch (startErr) {
      logger.warn("[speechToText] Не удалось запустить распознавание", { error: startErr });
      reject(new Error("Не удалось запустить распознавание"));
    }
  });
}
