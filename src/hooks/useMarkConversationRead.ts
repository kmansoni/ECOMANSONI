import { useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";

/**
 * Marks incoming messages in a DM conversation as read and advances user's last_read_at.
 * Designed to be safe to call repeatedly (deduped via an in-flight guard).
 */
export function useMarkConversationRead() {
  const { user } = useAuth();
  const inFlightRef = useRef(false);

  const markConversationRead = useCallback(
    async (conversationId: string | null) => {
      if (!user || !conversationId) return;
      if (inFlightRef.current) return;

      inFlightRef.current = true;
      try {
        const nowIso = new Date().toISOString();

        // Run both updates in parallel.
        const [msgRes, partRes] = await Promise.all([
          supabase
            .from("messages")
            .update({ is_read: true })
            .eq("conversation_id", conversationId)
            .neq("sender_id", user.id)
            .eq("is_read", false),
          supabase
            .from("conversation_participants")
            .update({ last_read_at: nowIso })
            .eq("conversation_id", conversationId)
            .eq("user_id", user.id),
        ]);

        // Prefer surfacing errors to console to help debug RLS.
        if (msgRes.error) {
          // eslint-disable-next-line no-console
          console.error("[markConversationRead] messages update error", msgRes.error);
        }
        if (partRes.error) {
          // eslint-disable-next-line no-console
          console.error("[markConversationRead] participants update error", partRes.error);
        }
      } finally {
        inFlightRef.current = false;
      }
    },
    [user]
  );

  return { markConversationRead };
}
