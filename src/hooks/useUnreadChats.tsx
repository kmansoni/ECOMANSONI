import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { isChatProtocolV11EnabledForUser } from "@/lib/chat/protocolV11";

export function useUnreadChats() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const participantConversationIdsRef = useRef<Set<string>>(new Set());

  const fetchUnreadCount = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    try {
      if (isChatProtocolV11EnabledForUser(user.id)) {
        const { data, error } = await (supabase as any)
          .from("chat_inbox_projection")
          .select("dialog_id, unread_count")
          .eq("user_id", user.id);
        if (error) throw error;

        const rows = (Array.isArray(data) ? data : []) as Array<{ dialog_id: string; unread_count: number | null }>;
        participantConversationIdsRef.current = new Set(rows.map((r) => String(r.dialog_id)));
        const totalUnread = rows.reduce((sum, row) => sum + Number(row.unread_count || 0), 0);
        setUnreadCount(totalUnread);
        return;
      }

      // Get all conversations for the user
      const { data: participants } = await supabase
        .from("conversation_participants")
        .select("conversation_id, last_read_at")
        .eq("user_id", user.id);

      if (!participants || participants.length === 0) {
        participantConversationIdsRef.current = new Set();
        setUnreadCount(0);
        return;
      }

      participantConversationIdsRef.current = new Set(participants.map((p) => p.conversation_id));

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

      setUnreadCount(totalUnread);
    } catch (error) {
      console.error("Error fetching unread count:", error);
    }
  }, [user]);

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  // Subscribe to new messages
  useEffect(() => {
    if (!user) return;

    const v11 = isChatProtocolV11EnabledForUser(user.id);
    const channel = v11
      ? supabase
          .channel("unread-inbox-projection")
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "chat_inbox_projection",
              filter: `user_id=eq.${user.id}`,
            },
            () => {
              void fetchUnreadCount();
            }
          )
          .subscribe()
      : supabase
          .channel("unread-messages")
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "messages",
            },
            (payload) => {
              const message = payload.new as any;
              if (!message?.conversation_id) return;
              // IMPORTANT: Do not increment for conversations where the current user isn't a participant.
              if (!participantConversationIdsRef.current.has(message.conversation_id)) return;
              if (message.sender_id !== user.id) {
                setUnreadCount((prev) => prev + 1);
              }
            }
          )
          .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchUnreadCount]);

  return {
    unreadCount,
    refetch: fetchUnreadCount,
  };
}
