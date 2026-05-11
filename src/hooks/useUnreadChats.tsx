import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useUnifiedCounterStore } from "@/stores/useUnifiedCounterStore";
import { logger } from "@/lib/logger";

export function useUnreadChats() {
  const { user } = useAuth();
  const unreadCount = useUnifiedCounterStore((s) => s.chatsUnread);

  const refetch = useCallback(async () => {
    if (!user) return;
    const fetchStarted = Date.now();
    try {
      const rpc = supabase as unknown as { rpc: <T>(fn: string, args?: Record<string, unknown>) => Promise<{ data: T | null; error: unknown }> };
      const { data, error } = await rpc.rpc<unknown[]>("chat_get_inbox_v11", { p_limit: 500, p_cursor: null });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      let total = 0;
      for (const row of rows) {
        if (row && typeof row === "object" && "unread_count" in row) {
          total += Number((row as { unread_count: number | null }).unread_count) || 0;
        }
      }
    } catch (error) {
      logger.error("[useUnreadChats] Ошибка получения счётчика непрочитанных", { error });
    }
  }, [user]);

  return {
    unreadCount,
    refetch,
  };
}
