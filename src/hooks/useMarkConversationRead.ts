import { useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import {
  getOrCreateChatDeviceId,
  isChatProtocolV11EnabledForUser,
  nextClientWriteSeq,
} from "@/lib/chat/protocolV11";

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
        if (isChatProtocolV11EnabledForUser(user.id)) {
          const deviceId = getOrCreateChatDeviceId();
          const clientWriteSeq = nextClientWriteSeq(user.id);
          const { data: convRow, error: convErr } = await supabase
            .from("conversations")
            .select("last_message_seq")
            .eq("id", conversationId)
            .maybeSingle();
          if (convErr) {
            // eslint-disable-next-line no-console
            console.error("[markConversationRead] conversation load error", convErr);
            return;
          }

          const targetSeq = Number((convRow as any)?.last_message_seq || 0);
          const { error: rpcErr } = await (supabase as any).rpc("chat_mark_read_v11", {
            p_dialog_id: conversationId,
            p_device_id: deviceId,
            p_client_write_seq: clientWriteSeq,
            p_client_op_id: crypto.randomUUID(),
            p_last_read_seq: targetSeq,
            p_client_sent_at: new Date().toISOString(),
          });
          if (rpcErr) {
            // eslint-disable-next-line no-console
            console.error("[markConversationRead] v11 rpc error", rpcErr);
          }
          return;
        }

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
