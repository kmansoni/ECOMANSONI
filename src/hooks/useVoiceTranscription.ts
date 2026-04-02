/**
 * src/hooks/useVoiceTranscription.ts — Хук транскрипции голосовых сообщений.
 *
 * Стратегия кеширования:
 *  1. Если в БД есть messages.transcription_text — вернуть сразу
 *  2. Если нет — транскрибировать через Edge Function / Web Speech API
 *  3. Сохранить результат в messages.transcription_text
 *  4. Локальный кеш в Map для мгновенного доступа без запросов
 */

import { useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { transcribeAudioUrl } from "@/lib/audio/speechToText";
import { toast } from "sonner";

interface TranscriptionEntry {
  text: string;
  loading: boolean;
  error: string | null;
}

export function useVoiceTranscription() {
  const [transcriptions, setTranscriptions] = useState<Map<string, TranscriptionEntry>>(new Map());
  const pendingRef = useRef<Set<string>>(new Set());

  const updateEntry = useCallback((messageId: string, entry: TranscriptionEntry) => {
    setTranscriptions((prev) => {
      const next = new Map(prev);
      next.set(messageId, entry);
      return next;
    });
  }, []);

  /**
   * Запускает транскрипцию для конкретного сообщения.
   */
  const transcribe = useCallback(async (messageId: string, audioUrl: string) => {
    // Уже транскрибируется
    if (pendingRef.current.has(messageId)) return;

    // Уже есть результат
    const existing = transcriptions.get(messageId);
    if (existing?.text && !existing.error) return;

    pendingRef.current.add(messageId);
    updateEntry(messageId, { text: "", loading: true, error: null });

    try {
      // Проверим кеш в БД
      const { data: cachedMsg, error: fetchErr } = await supabase
        .from("messages")
        .select("transcription_text")
        .eq("id", messageId)
        .limit(1)
        .single();

      if (!fetchErr && cachedMsg?.transcription_text) {
        updateEntry(messageId, {
          text: cachedMsg.transcription_text,
          loading: false,
          error: null,
        });
        pendingRef.current.delete(messageId);
        return;
      }

      // Транскрибируем
      const result = await transcribeAudioUrl(audioUrl);

      // Сохраняем в БД
      const { error: updateErr } = await supabase
        .from("messages")
        .update({ transcription_text: result.text })
        .eq("id", messageId);

      if (updateErr) {
        logger.warn("[useVoiceTranscription] Не удалось сохранить транскрипцию в БД", {
          messageId,
          error: updateErr,
        });
      }

      updateEntry(messageId, {
        text: result.text,
        loading: false,
        error: null,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Ошибка транскрипции";
      logger.error("[useVoiceTranscription] Ошибка", { messageId, error: err });
      toast.error(errorMsg);
      updateEntry(messageId, { text: "", loading: false, error: errorMsg });
    } finally {
      pendingRef.current.delete(messageId);
    }
  }, [transcriptions, updateEntry]);

  const getTranscription = useCallback(
    (messageId: string): TranscriptionEntry | undefined => transcriptions.get(messageId),
    [transcriptions],
  );

  const isTranscribing = useCallback(
    (messageId: string): boolean => pendingRef.current.has(messageId),
    [],
  );

  return { transcribe, getTranscription, isTranscribing, transcriptions } as const;
}
