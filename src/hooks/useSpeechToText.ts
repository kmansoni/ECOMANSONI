/**
 * useSpeechToText — transcribes voice messages using Web Speech API.
 *
 * Strategy:
 * 1. Primary: Web Speech API (SpeechRecognition) — free, browser-native
 * 2. Fallback: shows "Расшифровка недоступна" if API not supported
 *
 * The hook plays the audio through a hidden <audio> element and captures
 * via SpeechRecognition simultaneously. This is a best-effort approach
 * since Web Speech API is designed for microphone input.
 *
 * For production: integrate server-side ASR (Whisper API).
 */

import { useState, useCallback } from "react";
import { logger } from "@/lib/logger";

export interface SpeechToTextResult {
  text: string;
  confidence: number;
  language: string;
}

export function useSpeechToText() {
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSupported = typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const transcribe = useCallback(async (audioUrl: string): Promise<string | null> => {
    if (!isSupported) {
      setError("Расшифровка недоступна в этом браузере");
      return null;
    }

    setTranscribing(true);
    setError(null);
    setTranscript(null);

    return new Promise((resolve) => {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();

      recognition.lang = "ru-RU";
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      let fullText = "";

      recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            fullText += event.results[i][0].transcript + " ";
          }
        }
      };

      recognition.onerror = (event: any) => {
        logger.warn("[useSpeechToText] STT error", { error: event.error });
        setError(`Ошибка распознавания: ${event.error}`);
        setTranscribing(false);
        resolve(null);
      };

      recognition.onend = () => {
        const trimmed = fullText.trim();
        setTranscript(trimmed || null);
        setTranscribing(false);
        resolve(trimmed || null);
      };

      // Start recognition — user must grant microphone permission
      try {
        recognition.start();

        // Play audio so user can hear it while it's being transcribed
        // Note: Web Speech API listens to microphone, not audio output.
        // For true audio-to-text, server-side ASR is needed.
        // This provides a "listen and dictate" UX as interim solution.
        const audio = new Audio(audioUrl);
        audio.play().catch(() => {/* autoplay blocked */});

        // Auto-stop after audio duration or 60s max
        audio.onended = () => {
          setTimeout(() => recognition.stop(), 1000);
        };
        setTimeout(() => {
          try { recognition.stop(); } catch { /* recognition already stopped */ }
          try { audio.pause(); } catch { /* audio already ended */ }
        }, 60_000);

      } catch (err) {
        setError("Не удалось запустить распознавание");
        setTranscribing(false);
        resolve(null);
      }
    });
  }, [isSupported]);

  const reset = useCallback(() => {
    setTranscript(null);
    setError(null);
    setTranscribing(false);
  }, []);

  return { transcribe, transcribing, transcript, error, isSupported, reset };
}
