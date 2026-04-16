import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useUnifiedCounterStore } from "@/stores/useUnifiedCounterStore";
import { isChatProtocolV11EnabledForUser } from "@/lib/chat/protocolV11";
import { logger } from "@/lib/logger";
import { dbLoose } from "@/lib/supabase";

export function useUnreadChats() {
  const { user } = useAuth();
  const unreadCount = useUnifiedCounterStore((s) => s.chatsUnread);

  const refetch = useCallback(async () => {
    if (!user) return;
    const fetchStarted = Date.now();
    try {
      if (isChatProtocolV11EnabledForUser(user.id)) {
        const { data, error } = await dbLoose
          .from("chat_inbox_projection")
          .select("dialog_id, unread_count")
          .eq("user_id", user.id);
        if (error) throw error;
        const rows = (Array.isArray(data) ? data : []) as Array<{ dialog_id: string; unread_count: number | null }>;
        const total = rows.reduce((sum, row) => sum + Number(row.unread_count || 0), 0);
        useUnifiedCounterStore.getState().setChatsUnread(total, fetchStarted);
        return;
      }

      const { data: participants } = await supabase
        .from("conversation_participants")
        .select("conversation_id, last_read_at")
        .eq("user_id", user.id);

      if (!participants || participants.length === 0) {
        useUnifiedCounterStore.getState().setChatsUnread(0, fetchStarted);
        return;
      }

      let totalUnread = 0;
      for (const participant of participants) {
        const { count } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", participant.conversation_id)
          .neq("sender_id", user.id)
          .gt("created_at", participant.last_read_at || "1970-01-01");
        totalUnread += count || 0;
      }

      useUnifiedCounterStore.getState().setChatsUnread(totalUnread, fetchStarted);
    } catch (error) {
      logger.error("[useUnreadChats] Ошибка получения счётчика непрочитанных", { error });
    }
  }, [user]);

  return {
    unreadCount,
    refetch,
  };
}
