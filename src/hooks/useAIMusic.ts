/**
 * useAIMusic — генерация AI-музыки для Reels.
 *
 * Возвращает:
 *  - generate(mood, durationSec, genre?) → MusicTrack
 *  - presets → предустановленные треки по настроению
 *  - isGenerating → boolean
 */

import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

export interface MusicTrack {
  url: string;
  title: string;
  duration: number;
  mood: string;
  isFallback?: boolean;
}

export type MoodType = "happy" | "sad" | "energetic" | "relaxed" | "dramatic";
export type GenreType = "pop" | "lofi" | "electronic" | "acoustic";

interface MoodOption {
  value: MoodType;
  label: string;
  emoji: string;
}

interface GenreOption {
  value: GenreType;
  label: string;
}

export const MOOD_OPTIONS: MoodOption[] = [
  { value: "happy", label: "Весёлый", emoji: "😊" },
  { value: "sad", label: "Грустный", emoji: "😢" },
  { value: "energetic", label: "Энергичный", emoji: "⚡" },
  { value: "relaxed", label: "Расслабленный", emoji: "🧘" },
  { value: "dramatic", label: "Драматический", emoji: "🎭" },
];

export const GENRE_OPTIONS: GenreOption[] = [
  { value: "pop", label: "Pop" },
  { value: "lofi", label: "Lo-fi" },
  { value: "electronic", label: "Electronic" },
  { value: "acoustic", label: "Acoustic" },
];

const PRESET_TRACKS: Record<MoodType, MusicTrack[]> = {
  happy: [
    { url: "", title: "Sunny Day", duration: 30, mood: "happy" },
    { url: "", title: "Feel Good", duration: 15, mood: "happy" },
  ],
  sad: [
    { url: "", title: "Rainy Window", duration: 30, mood: "sad" },
  ],
  energetic: [
    { url: "", title: "Gym Mode", duration: 20, mood: "energetic" },
  ],
  relaxed: [
    { url: "", title: "Chill Wave", duration: 45, mood: "relaxed" },
  ],
  dramatic: [
    { url: "", title: "Cinematic Rise", duration: 30, mood: "dramatic" },
  ],
};

export function useAIMusic() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastTrack, setLastTrack] = useState<MusicTrack | null>(null);

  const generate = useCallback(
    async (mood: MoodType, durationSec: number, genre?: GenreType): Promise<MusicTrack | null> => {
      if (isGenerating) return null;
      setIsGenerating(true);

      try {
        const response = await supabase.functions.invoke("generate-music", {
          body: { mood, duration: durationSec, genre },
        });

        if (response.error) {
          logger.error("[useAIMusic] Ошибка генерации музыки", { error: response.error });
          toast.error("Не удалось сгенерировать музыку");
          return null;
        }

        const data = response.data as Record<string, unknown> | null;
        const url = typeof data?.url === "string" ? data.url : "";
        const title = typeof data?.title === "string" ? data.title : `${mood} track`;
        const dur = typeof data?.duration === "number" ? data.duration : durationSec;
        const isFallback = data?.is_fallback === true;

        if (!url) {
          toast.error("Не удалось получить трек");
          return null;
        }

        const track: MusicTrack = { url, title, duration: dur, mood, isFallback };
        setLastTrack(track);

        if (isFallback) {
          toast.info("Использован трек из библиотеки");
        } else {
          toast.success("Музыка сгенерирована");
        }

        return track;
      } catch (e) {
        logger.error("[useAIMusic] Непредвиденная ошибка", { error: e });
        toast.error("Ошибка при генерации музыки");
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [isGenerating],
  );

  const presets = useMemo(() => PRESET_TRACKS, []);

  return { generate, presets, isGenerating, lastTrack, moods: MOOD_OPTIONS, genres: GENRE_OPTIONS } as const;
}
