/**
 * src/hooks/useAIAltText.ts
 *
 * Хук для AI-генерации alt text (описания для screen reader).
 * Вызывает Edge Function generate-alt-text.
 */
import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

const MAX_ALT_TEXT = 1000;

export function useAIAltText() {
  const [altText, setAltText] = useState("");
  const [loading, setLoading] = useState(false);

  const generate = useCallback(async (imageUrl: string): Promise<string> => {
    if (!imageUrl.trim()) {
      toast.error("URL изображения обязателен");
      return "";
    }

    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        toast.error("Требуется авторизация");
        return "";
      }

      const response = await supabase.functions.invoke("generate-alt-text", {
        body: { imageUrl: imageUrl.trim() },
      });

      if (response.error) {
        logger.error("[useAIAltText] Ошибка вызова функции", { error: response.error });
        toast.error("Не удалось сгенерировать описание");
        return "";
      }

      const body = response.data as Record<string, unknown> | null;
      const result = typeof body?.altText === "string"
        ? body.altText.slice(0, MAX_ALT_TEXT)
        : "";

      setAltText(result);
      return result;
    } catch (e) {
      logger.error("[useAIAltText] Непредвиденная ошибка", { error: e });
      toast.error("Не удалось сгенерировать описание");
      return "";
    } finally {
      setLoading(false);
    }
  }, []);

  return { generate, altText, setAltText, loading } as const;
}
