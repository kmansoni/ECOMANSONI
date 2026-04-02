/**
 * useAIImageGen — генерация изображений через DALL-E 3.
 *
 * Возвращает:
 *  - generate(prompt, style?, size?) — запустить генерацию
 *  - recentGenerations — последние 20 из localStorage
 *  - isGenerating — флаг
 *  - remainingQuota — оставшиеся генерации (5/час)
 */
import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

export interface GeneratedImage {
  url: string;
  revisedPrompt: string;
  prompt: string;
  style?: string;
  size?: string;
  createdAt: string;
}

type ImageSize = "256" | "512" | "1024";
type ImageStyle = "Реалистичный" | "Аниме" | "Арт" | "3D";

const STORAGE_KEY = "ai_image_gen_history";
const RATE_STORAGE_KEY = "ai_image_gen_timestamps";
const MAX_HISTORY = 20;
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 3600_000;

function loadHistory(): GeneratedImage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GeneratedImage[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveHistory(images: GeneratedImage[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(images.slice(0, MAX_HISTORY)));
  } catch {
    // Переполнение localStorage — игнорируем
  }
}

function loadTimestamps(): number[] {
  try {
    const raw = localStorage.getItem(RATE_STORAGE_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as number[]).filter((t) => Date.now() - t < RATE_WINDOW_MS);
  } catch {
    return [];
  }
}

function saveTimestamps(ts: number[]): void {
  try {
    localStorage.setItem(RATE_STORAGE_KEY, JSON.stringify(ts));
  } catch {
    // Игнорируем
  }
}

export function useAIImageGen() {
  const [recentGenerations, setRecentGenerations] = useState<GeneratedImage[]>(loadHistory);
  const [isGenerating, setIsGenerating] = useState(false);
  const [remainingQuota, setRemainingQuota] = useState(() => {
    const active = loadTimestamps();
    return Math.max(0, RATE_LIMIT - active.length);
  });

  // Обновляем квоту каждые 30 сек
  useEffect(() => {
    const interval = setInterval(() => {
      const active = loadTimestamps();
      saveTimestamps(active);
      setRemainingQuota(Math.max(0, RATE_LIMIT - active.length));
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  const generate = useCallback(
    async (prompt: string, style?: ImageStyle, size?: ImageSize): Promise<GeneratedImage | null> => {
      if (!prompt.trim()) {
        toast.error("Введите описание изображения");
        return null;
      }

      const currentTs = loadTimestamps();
      if (currentTs.length >= RATE_LIMIT) {
        toast.error("Лимит генераций: 5 в час. Попробуйте позже.");
        return null;
      }

      setIsGenerating(true);
      try {
        const response = await supabase.functions.invoke("generate-image", {
          body: { prompt: prompt.trim(), style, size },
        });

        if (response.error) {
          logger.error("[useAIImageGen] Ошибка генерации", { error: response.error });
          toast.error("Не удалось сгенерировать изображение");
          return null;
        }

        const data = response.data as Record<string, unknown> | null;
        const url = typeof data?.url === "string" ? data.url : "";
        const revisedPrompt = typeof data?.revisedPrompt === "string" ? data.revisedPrompt : prompt;

        if (!url) {
          toast.error("Не удалось получить изображение");
          return null;
        }

        const image: GeneratedImage = {
          url,
          revisedPrompt,
          prompt: prompt.trim(),
          style,
          size,
          createdAt: new Date().toISOString(),
        };

        const updated = [image, ...recentGenerations].slice(0, MAX_HISTORY);
        setRecentGenerations(updated);
        saveHistory(updated);

        const newTs = [...currentTs, Date.now()];
        saveTimestamps(newTs);
        setRemainingQuota(Math.max(0, RATE_LIMIT - newTs.length));

        toast.success("Изображение сгенерировано");
        return image;
      } catch (e) {
        logger.error("[useAIImageGen] Непредвиденная ошибка", { error: e });
        toast.error("Ошибка при генерации изображения");
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [recentGenerations],
  );

  return { generate, recentGenerations, isGenerating, remainingQuota } as const;
}
