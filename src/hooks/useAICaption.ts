/**
 * useAICaption — генерация AI-подписей для постов.
 *
 * Возвращает:
 *  - generateCaption(imageUrl?, context?, style?) → string
 *  - isGenerating → boolean
 *  - styles → список доступных стилей
 */

import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

export type CaptionStyle = "casual" | "professional" | "funny" | "inspirational";

interface StyleOption {
  value: CaptionStyle;
  label: string;
  emoji: string;
}

const STYLE_OPTIONS: StyleOption[] = [
  { value: "casual", label: "Непринуждённый", emoji: "😊" },
  { value: "professional", label: "Профессиональный", emoji: "💼" },
  { value: "funny", label: "Смешной", emoji: "😂" },
  { value: "inspirational", label: "Вдохновляющий", emoji: "✨" },
];

export function useAICaption() {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateCaption = useCallback(
    async (
      imageUrl?: string,
      context?: string,
      style: CaptionStyle = "casual",
    ): Promise<string | null> => {
      if (isGenerating) return null;
      setIsGenerating(true);

      try {
        const response = await supabase.functions.invoke("generate-caption", {
          body: {
            image_url: imageUrl ?? undefined,
            context: context ?? undefined,
            style,
          },
        });

        if (response.error) {
          logger.error("[useAICaption] Ошибка генерации подписи", { error: response.error });
          toast.error("Не удалось сгенерировать подпись");
          return null;
        }

        const data = response.data as Record<string, unknown> | null;
        const caption = typeof data?.caption === "string" ? data.caption : "";

        if (!caption) {
          toast.error("Не удалось получить подпись");
          return null;
        }

        const isFallback = data?.is_fallback === true;
        if (isFallback) {
          toast.info("Использована подпись из шаблонов");
        } else {
          toast.success("Подпись сгенерирована");
        }

        return caption;
      } catch (e) {
        logger.error("[useAICaption] Непредвиденная ошибка", { error: e });
        toast.error("Ошибка при генерации подписи");
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [isGenerating],
  );

  const styles = useMemo(() => STYLE_OPTIONS, []);

  return { generateCaption, isGenerating, styles } as const;
}
