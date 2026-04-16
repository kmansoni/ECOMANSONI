import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

/**
 * Лёгкий хук — проверяет, есть ли у пользователя активные (не истёкшие) stories.
 * Один head-запрос вместо полной загрузки useStories.
 */
export function useUserHasStories(userId?: string) {
  const [hasStories, setHasStories] = useState(false);

  useEffect(() => {
    if (!userId) return;

    const uid = userId;
    const controller = new AbortController();

    async function check() {
      try {
        const { count, error } = await supabase
          .from("stories")
          .select("*", { count: "exact", head: true })
          .eq("author_id", uid)
          .gt("expires_at", new Date().toISOString())
          .limit(1)
          .abortSignal(controller.signal);

        if (error) throw error;
        setHasStories((count ?? 0) > 0);
      } catch (err) {
        if (controller.signal.aborted) return;
        logger.warn("[useUserHasStories] check failed", { error: err, userId });
      }
    }

    void check();
    return () => controller.abort();
  }, [userId]);

  return hasStories;
}
