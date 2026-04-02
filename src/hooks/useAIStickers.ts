/**
 * useAIStickers — генерация и сохранение AI-стикеров.
 *
 * Возвращает:
 *  - generateSticker(prompt) — создать стикер
 *  - myStickers — сохранённые стикеры из Supabase
 *  - saveSticker(url, prompt) — сохранить в коллекцию
 *  - deleteSticker(id) — удалить из коллекции
 *  - isGenerating — флаг генерации
 *  - loading — флаг загрузки списка
 */
import { useState, useEffect, useCallback } from "react";
import { supabase, dbLoose } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

export interface AISticker {
  id: string;
  prompt: string;
  image_url: string;
  created_at: string;
}

const MAX_STICKERS = 100;

export function useAIStickers() {
  const { user } = useAuth();
  const [myStickers, setMyStickers] = useState<AISticker[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loading, setLoading] = useState(false);

  // Загружаем стикеры пользователя
  useEffect(() => {
    if (!user) {
      setMyStickers([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    dbLoose
      .from("ai_stickers")
      .select("id, prompt, image_url, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(MAX_STICKERS)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          logger.error("[useAIStickers] Ошибка загрузки стикеров", { error });
        } else {
          setMyStickers((data ?? []) as AISticker[]);
        }
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [user]);

  const generateSticker = useCallback(
    async (prompt: string): Promise<{ url: string } | null> => {
      if (!prompt.trim()) {
        toast.error("Введите описание стикера");
        return null;
      }

      setIsGenerating(true);
      try {
        const response = await supabase.functions.invoke("generate-sticker", {
          body: { prompt: prompt.trim() },
        });

        if (response.error) {
          logger.error("[useAIStickers] Ошибка генерации", { error: response.error });
          toast.error("Не удалось сгенерировать стикер");
          return null;
        }

        const data = response.data as Record<string, unknown> | null;
        const url = typeof data?.url === "string" ? data.url : "";

        if (!url) {
          toast.error("Не удалось получить стикер");
          return null;
        }

        toast.success("Стикер сгенерирован");
        return { url };
      } catch (e) {
        logger.error("[useAIStickers] Непредвиденная ошибка", { error: e });
        toast.error("Ошибка при генерации стикера");
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [],
  );

  const saveSticker = useCallback(
    async (imageUrl: string, prompt: string): Promise<void> => {
      if (!user) {
        toast.error("Требуется авторизация");
        return;
      }

      try {
        const { data, error } = await dbLoose
          .from("ai_stickers")
          .insert({ user_id: user.id, prompt: prompt.trim(), image_url: imageUrl })
          .select("id, prompt, image_url, created_at")
          .single();

        if (error) {
          logger.error("[useAIStickers] Ошибка сохранения", { error });
          toast.error("Не удалось сохранить стикер");
          return;
        }

        setMyStickers((prev) => [data as AISticker, ...prev].slice(0, MAX_STICKERS));
        toast.success("Стикер сохранён в коллекцию");
      } catch (e) {
        logger.error("[useAIStickers] saveSticker error", { error: e });
        toast.error("Ошибка при сохранении стикера");
      }
    },
    [user],
  );

  const deleteSticker = useCallback(
    async (id: string): Promise<void> => {
      if (!user) return;

      try {
        const { error } = await dbLoose
          .from("ai_stickers")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);

        if (error) {
          logger.error("[useAIStickers] Ошибка удаления", { error });
          toast.error("Не удалось удалить стикер");
          return;
        }

        setMyStickers((prev) => prev.filter((s) => s.id !== id));
        toast.success("Стикер удалён");
      } catch (e) {
        logger.error("[useAIStickers] deleteSticker error", { error: e });
        toast.error("Ошибка при удалении стикера");
      }
    },
    [user],
  );

  return { generateSticker, myStickers, saveSticker, deleteSticker, isGenerating, loading } as const;
}
