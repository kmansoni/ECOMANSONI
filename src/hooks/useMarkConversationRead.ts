import { useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import {
  getOrCreateChatDeviceId,
  isChatProtocolV11EnabledForUser,
  nextClientWriteSeq,
} from "@/lib/chat/protocolV11";

type UnknownRecord = Record<string, unknown>;

type RpcResponse<T> = Promise<{ data: T | null; error: unknown }>;

interface ChatReadRpcClient {
  rpc: <T>(fn: string, args?: Record<string, unknown>) => RpcResponse<T>;
}

interface ConversationSeqRow {
  lastMessageSeq: number | null;
  serverSeq: number | null;
}

interface DeliveredAckRow {
  deliveredUpToSeq: number | null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function getNumberField(source: UnknownRecord, key: string): number | null {
  const value = source[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getStringField(source: UnknownRecord, key: string): string | null {
  const value = source[key];
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function getChatReadRpcClient(): ChatReadRpcClient {
  return supabase as unknown as ChatReadRpcClient;
}

function decodeConversationSeqRow(value: unknown): ConversationSeqRow {
  if (!isRecord(value)) {
    return { lastMessageSeq: null, serverSeq: null };
  }
  return {
    lastMessageSeq: getNumberField(value, "last_message_seq"),
    serverSeq: getNumberField(value, "server_seq"),
  };
}

function decodeDeliveredAckRow(value: unknown): DeliveredAckRow {
  if (!isRecord(value)) {
    return { deliveredUpToSeq: null };
  }
  return {
    deliveredUpToSeq: getNumberField(value, "delivered_up_to_seq"),
  };
}

function isReadGtDeliveredError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const message = getStringField(error, "message") ?? "";
  const details = getStringField(error, "details") ?? "";
  return `${message} ${details}`.includes("read_gt_delivered");
}

/**
 * Marks incoming messages in a DM conversation as read and advances user's last_read_at.
 * Designed to be safe to call repeatedly (deduped via an in-flight guard).
 */
export function useMarkConversationRead() {
  const { user } = useAuth();
  const rpc = getChatReadRpcClient();
  const inFlightConversationIdsRef = useRef<Set<string>>(new Set());

  const markConversationRead = useCallback(
    async (conversationId: string | null) => {
      if (!user || !conversationId) return;
      if (inFlightConversationIdsRef.current.has(conversationId)) return;

      inFlightConversationIdsRef.current.add(conversationId);
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

          const targetSeq = decodeConversationSeqRow(convRow).lastMessageSeq ?? 0;
          const { error: rpcErr } = await rpc.rpc<unknown>("chat_mark_read_v11", {
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

        const convSeq = decodeConversationSeqRow(convRow);
        const targetSeq = convSeq.serverSeq ?? convSeq.lastMessageSeq ?? 0;
        if (!Number.isFinite(targetSeq) || targetSeq <= 0) return;

        // Keep server invariants: read_up_to_seq must never exceed delivered_up_to_seq.
        // Force delivered cursor first to avoid transient read_gt_delivered on fast UI paths.
        const { data: deliveredRows, error: deliveredErr } = await rpc.rpc<unknown>("ack_delivered_v1", {
          p_conversation_id: conversationId,
          p_up_to_seq: targetSeq,
        });
        if (deliveredErr) {
          console.error("[markConversationRead] ack_delivered_v1 rpc error", deliveredErr);
          return;
        }

        const deliveredRow = decodeDeliveredAckRow(Array.isArray(deliveredRows) ? deliveredRows[0] : deliveredRows);
        const deliveredSeq = deliveredRow.deliveredUpToSeq ?? targetSeq;
        const readUpToSeq = Number.isFinite(deliveredSeq) && deliveredSeq > 0 ? Math.min(targetSeq, deliveredSeq) : targetSeq;

        const { error: rpcErr } = await rpc.rpc<unknown>("ack_read_v1", {
          p_conversation_id: conversationId,
          p_up_to_seq: readUpToSeq,
        });
        if (rpcErr) {
          // If delivered cursor moved concurrently, retry once with the latest delivered value.
          if (isReadGtDeliveredError(rpcErr)) {
            const { data: deliveredRetryRows, error: deliveredRetryErr } = await rpc.rpc<unknown>("ack_delivered_v1", {
              p_conversation_id: conversationId,
              p_up_to_seq: targetSeq,
            });
            if (!deliveredRetryErr) {
              const deliveredRetryRow = decodeDeliveredAckRow(Array.isArray(deliveredRetryRows) ? deliveredRetryRows[0] : deliveredRetryRows);
              const deliveredRetrySeq = deliveredRetryRow.deliveredUpToSeq ?? 0;
              if (Number.isFinite(deliveredRetrySeq) && deliveredRetrySeq > 0) {
                const { error: readRetryErr } = await rpc.rpc<unknown>("ack_read_v1", {
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
        inFlightConversationIdsRef.current.delete(conversationId);
      }
    },
    [rpc, user]
  );

  return { markConversationRead };
}
