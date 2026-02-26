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
            console.error("[markConversationRead] v11 rpc error", rpcErr);
          }
          return;
        }

        // Seq-only read receipt: advance read cursor up to current server seq.
        const { data: convRow, error: convErr } = await supabase
          .from("conversations")
          .select("server_seq, last_message_seq")
          .eq("id", conversationId)
          .maybeSingle();
        if (convErr) {
          console.error("[markConversationRead] conversation load error", convErr);
          return;
        }

        const targetSeq = Number((convRow as any)?.server_seq || (convRow as any)?.last_message_seq || 0);
        if (!Number.isFinite(targetSeq) || targetSeq <= 0) return;

        // Keep server invariants: read_up_to_seq must never exceed delivered_up_to_seq.
        // Force delivered cursor first to avoid transient read_gt_delivered on fast UI paths.
        const { data: deliveredRows, error: deliveredErr } = await (supabase as any).rpc("ack_delivered_v1", {
          p_conversation_id: conversationId,
          p_up_to_seq: targetSeq,
        });
        if (deliveredErr) {
          console.error("[markConversationRead] ack_delivered_v1 rpc error", deliveredErr);
          return;
        }

        const deliveredRow = Array.isArray(deliveredRows) ? deliveredRows[0] : deliveredRows;
        const deliveredSeq = Number((deliveredRow as any)?.delivered_up_to_seq || targetSeq);
        const readUpToSeq = Number.isFinite(deliveredSeq) && deliveredSeq > 0 ? Math.min(targetSeq, deliveredSeq) : targetSeq;

        const { error: rpcErr } = await (supabase as any).rpc("ack_read_v1", {
          p_conversation_id: conversationId,
          p_up_to_seq: readUpToSeq,
        });
        if (rpcErr) {
          // If delivered cursor moved concurrently, retry once with the latest delivered value.
          const isReadGtDelivered = String((rpcErr as any)?.message || "").includes("read_gt_delivered");
          if (isReadGtDelivered) {
            const { data: deliveredRetryRows, error: deliveredRetryErr } = await (supabase as any).rpc("ack_delivered_v1", {
              p_conversation_id: conversationId,
              p_up_to_seq: targetSeq,
            });
            if (!deliveredRetryErr) {
              const deliveredRetryRow = Array.isArray(deliveredRetryRows) ? deliveredRetryRows[0] : deliveredRetryRows;
              const deliveredRetrySeq = Number((deliveredRetryRow as any)?.delivered_up_to_seq || 0);
              if (Number.isFinite(deliveredRetrySeq) && deliveredRetrySeq > 0) {
                const { error: readRetryErr } = await (supabase as any).rpc("ack_read_v1", {
                  p_conversation_id: conversationId,
                  p_up_to_seq: Math.min(targetSeq, deliveredRetrySeq),
                });
                if (!readRetryErr) return;
                console.error("[markConversationRead] ack_read_v1 retry rpc error", readRetryErr);
                return;
              }
            }
          }
          console.error("[markConversationRead] ack_read_v1 rpc error", rpcErr);
        }
      } finally {
        inFlightRef.current = false;
      }
    },
    [user]
  );

  return { markConversationRead };
}
