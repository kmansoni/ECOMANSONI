import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Лёгкий хук: считает общее количество непрочитанных DM
 * из chat_inbox_projection. Подписывается на realtime для обновлений.
 */
export function useUnreadDmCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchCount() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || controller.signal.aborted) return;

      const { data, error } = await supabase
        .from("chat_inbox_projection")
        .select("unread_count")
        .eq("user_id", user.id)
        .gt("unread_count", 0)
        .limit(100)
        .abortSignal(controller.signal);

      if (!error && data) {
        const total = data.reduce((sum, row) => sum + (Number(row.unread_count) || 0), 0);
        setCount(total);
      }
    }

    void fetchCount();

    // Realtime: пересчитать при изменениях inbox
    const channel = supabase
      .channel("unread-dm-counter")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_inbox_projection" }, () => {
        void fetchCount();
      })
      .subscribe();

    return () => {
      controller.abort();
      void supabase.removeChannel(channel);
    };
  }, []);

  return count;
}
