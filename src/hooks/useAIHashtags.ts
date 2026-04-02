/**
 * src/hooks/useAIHashtags.ts
 *
 * Хук для AI-подбора хэштегов при создании поста.
 * Вызывает Edge Function suggest-hashtags.
 */
import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

const MAX_SUGGESTIONS = 30;

export function useAIHashtags() {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const suggest = useCallback(async (caption: string, imageDescription?: string): Promise<string[]> => {
    const trimmed = caption.trim();
    if (trimmed.length < 3) {
      toast.error("Введите описание (минимум 3 символа)");
      return [];
    }

    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        toast.error("Требуется авторизация");
        return [];
      }

      const response = await supabase.functions.invoke("suggest-hashtags", {
        body: {
          caption: trimmed,
          imageDescription: imageDescription?.trim() ?? undefined,
        },
      });

      if (response.error) {
        logger.error("[useAIHashtags] Ошибка вызова функции", { error: response.error });
        toast.error("Не удалось подобрать хэштеги");
        return [];
      }

      const body = response.data as Record<string, unknown> | null;
      const hashtags = Array.isArray(body?.hashtags)
        ? (body.hashtags as unknown[])
            .filter((h): h is string => typeof h === "string" && h.length > 0)
            .slice(0, MAX_SUGGESTIONS)
        : [];

      setSuggestions(hashtags);
      return hashtags;
    } catch (e) {
      logger.error("[useAIHashtags] Непредвиденная ошибка", { error: e });
      toast.error("Не удалось подобрать хэштеги");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return { suggest, suggestions, loading } as const;
}
