// LEGACY_FALLBACK_MARKER: DM writes may fallback to v1 if v11 rejects
// falling back to legacy
import { useState, useEffect, useCallback, useRef } from "react";
import { useDeliveryStatus } from "./useDeliveryStatus";
import type { DeliveryStatusMap } from "./useDeliveryStatus";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { toast } from "sonner";
import { getLastChatSchemaProbe } from "@/lib/chat/schemaProbe";
import { isTableMissingError } from "@/lib/utils/isTableMissingError";
import { uploadMedia } from "@/lib/mediaUpload";
import { buildChatBodyEnvelope, sendMessageV1 } from "@/lib/chat/sendMessageV1";
import { parseJsonRecord } from "@/lib/chat/decode";
import { sanitizeReceivedText } from "@/lib/text-encoding";
import { canonicalizeOutgoingChatText } from "@/lib/chat/textPipeline";
import {
  bumpChatMetric,
  getOrCreateChatDeviceId,
  isChatProtocolV11EnabledForUser,
  observeChatMetric,
  nextClientWriteSeq,
} from "@/lib/chat/protocolV11";
import { ChatV11RecoveryService } from "@/lib/chat/recoveryV11";
import { getChatV11RecoveryPolicyConfig } from "@/lib/chat/recoveryPolicyV11";
import { resolveChatV11RecoveryAction } from "@/lib/chat/rpcErrorPolicyV11";
import { checkHashtagsAllowedForText } from "@/lib/hashtagModeration";
import { fetchUserBriefMap, resolveUserBrief, type UserBrief, type UserBriefClient } from "@/lib/users/userBriefs";
import { logger } from "@/lib/logger";

type UnknownRecord = Record<string, unknown>;

type RpcResponse<T> = Promise<{ data: T | null; error: unknown }>;

interface ChatRpcClient {
  rpc: <T>(fn: string, args?: Record<string, unknown>) => RpcResponse<T>;
}

interface ChatSendAck {
  ackStatus: string | null;
  msgId: string | null;
  errorCode: string | null;
}

interface ChatWriteStatus {
  msgId: string | null;
}

interface ChatReceipt {
  clientWriteSeq: number | null;
  deviceId: string | null;
}

interface ChatFullSnapshotMessage {
  msgId: string;
  senderId: string;
  content: string;
  createdAt: string;
  msgSeq: number | null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function getStringField(source: UnknownRecord, key: string): string | null {
  const value = source[key];
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
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

function getBooleanField(source: UnknownRecord, key: string): boolean | null {
  const value = source[key];
  return typeof value === "boolean" ? value : null;
}

function getRecordField(source: UnknownRecord, key: string): UnknownRecord | null {
  const value = source[key];
  return isRecord(value) ? value : null;
}

function getArrayField(source: UnknownRecord, key: string): unknown[] {
  const value = source[key];
  return Array.isArray(value) ? value : [];
}

function toRecordArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function getChatRpcClient(): ChatRpcClient {
  return supabase as unknown as ChatRpcClient;
}

function decodeChatSendAck(value: unknown): ChatSendAck | null {
  if (!isRecord(value)) return null;
  return {
    ackStatus: getStringField(value, "ack_status"),
    msgId: getStringField(value, "msg_id"),
    errorCode: getStringField(value, "error_code"),
  };
}

function decodeChatWriteStatus(value: unknown): ChatWriteStatus | null {
  if (!isRecord(value)) return null;
  return {
    msgId: getStringField(value, "msg_id"),
  };
}

function decodeChatReceipt(value: unknown): ChatReceipt | null {
  if (!isRecord(value)) return null;
  return {
    clientWriteSeq: getNumberField(value, "client_write_seq"),
    deviceId: getStringField(value, "device_id"),
  };
}

function decodeChatFullSnapshotMessages(value: unknown): ChatFullSnapshotMessage[] {
  return toRecordArray(value)
    .map((row) => {
      const msgId = getStringField(row, "msg_id");
      if (!msgId) return null;
      return {
        msgId,
        senderId: getStringField(row, "sender_id") ?? "",
        content: getStringField(row, "content") ?? "",
        createdAt: getStringField(row, "created_at") ?? new Date().toISOString(),
        msgSeq: getNumberField(row, "msg_seq"),
      };
    })
    .filter((row): row is ChatFullSnapshotMessage => row !== null);
}

function applyLegacyEnvelopeFallback(message: ChatMessage): ChatMessage {
  const envelope = parseJsonRecord(message.content);
  if (!envelope) return message;

  const kind = getStringField(envelope, "kind");
  if (!kind) return message;

  const fallbackMediaType = message.media_type ?? (
    kind === "media"
      ? getStringField(envelope, "media_type")
      : ["poll", "sticker", "gif", "gift", "contact", "document"].includes(kind)
        ? kind
        : null
  );
  const fallbackMediaUrl = message.media_url ?? getStringField(envelope, "media_url");
  const fallbackPollId = message.poll_id ?? (kind === "poll" ? getStringField(envelope, "poll_id") : null);
  const fallbackLocationLat = message.location_lat ?? (kind === "location" ? getNumberField(envelope, "lat") : null);
  const fallbackLocationLng = message.location_lng ?? (kind === "location" ? getNumberField(envelope, "lng") : null);
  const fallbackLocationAccuracy = message.location_accuracy_m ?? (kind === "location" ? getNumberField(envelope, "accuracy_m") : null);
  const fallbackLocationIsLive = message.location_is_live ?? (kind === "location" ? getBooleanField(envelope, "is_live") : null);

  if (
    fallbackMediaType === message.media_type &&
    fallbackMediaUrl === message.media_url &&
    fallbackPollId === message.poll_id &&
    fallbackLocationLat === message.location_lat &&
    fallbackLocationLng === message.location_lng &&
    fallbackLocationAccuracy === message.location_accuracy_m &&
    fallbackLocationIsLive === message.location_is_live
  ) {
    return message;
  }

  return {
    ...message,
    media_type: fallbackMediaType ?? message.media_type ?? null,
    media_url: fallbackMediaUrl ?? message.media_url ?? null,
    poll_id: fallbackPollId ?? message.poll_id ?? null,
    location_lat: fallbackLocationLat ?? message.location_lat ?? null,
    location_lng: fallbackLocationLng ?? message.location_lng ?? null,
    location_accuracy_m: fallbackLocationAccuracy ?? message.location_accuracy_m ?? null,
    location_is_live: fallbackLocationIsLive ?? message.location_is_live ?? null,
  };
}

function decodeRealtimeChatMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) return null;

  const id = getStringField(value, "id");
  const conversationId = getStringField(value, "conversation_id");
  const senderId = getStringField(value, "sender_id");
  if (!id || !conversationId || !senderId) return null;

  return applyLegacyEnvelopeFallback({
    id,
    client_msg_id: getStringField(value, "client_msg_id"),
    conversation_id: conversationId,
    sender_id: senderId,
    content: getStringField(value, "content") ?? "",
    is_read: getBooleanField(value, "is_read") ?? false,
    created_at: getStringField(value, "created_at") ?? new Date().toISOString(),
    edited_at: getStringField(value, "edited_at"),
    seq: getNumberField(value, "seq"),
    media_url: getStringField(value, "media_url"),
    media_type: getStringField(value, "media_type"),
    duration_seconds: getNumberField(value, "duration_seconds"),
    shared_post_id: getStringField(value, "shared_post_id"),
    shared_reel_id: getStringField(value, "shared_reel_id"),
    disappear_in_seconds: getNumberField(value, "disappear_in_seconds"),
    disappear_at: getStringField(value, "disappear_at"),
    disappeared: getBooleanField(value, "disappeared"),
    is_silent: getBooleanField(value, "is_silent"),
    poll_id: getStringField(value, "poll_id"),
    location_lat: getNumberField(value, "location_lat"),
    location_lng: getNumberField(value, "location_lng"),
    location_accuracy_m: getNumberField(value, "location_accuracy_m"),
    location_is_live: getBooleanField(value, "location_is_live"),
  });
}

function decodeRealtimeDeletedChatMessage(value: unknown): { id: string } | null {
  if (!isRecord(value)) return null;
  const id = getStringField(value, "id");
  return id ? { id } : null;
}

function findNearMatchOptimisticMessages(messages: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  const serverTime = Date.parse(incoming.created_at);
  if (Number.isNaN(serverTime)) return [];

  return messages.filter((message) => {
    if (!message.id.startsWith("local:")) return false;
    if (message.sender_id !== incoming.sender_id) return false;
    if ((message.content || "") !== (incoming.content || "")) return false;
    const localTime = Date.parse(message.created_at);
    if (Number.isNaN(localTime)) return false;
    return Math.abs(serverTime - localTime) <= 15_000;
  });
}

function getErrorMessage(err: unknown): string {
  if (!err) return "Unknown error";
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (isRecord(err)) {
    // PostgREST errors
    if (typeof err.message === "string") return err.message;
    if (typeof err.error_description === "string") return err.error_description;
    if (typeof err.details === "string") return err.details;
    try {
      return JSON.stringify(err);
    } catch (_error) {
      return String(err);
    }
  }
  return String(err);
}

function isBlockedDmError(err: unknown): boolean {
  if (!isRecord(err)) return false;
  const code = typeof err.code === "string" ? err.code : "";
  const message = typeof err.message === "string" ? err.message.toLowerCase() : "";
  const details = typeof err.details === "string" ? err.details.toLowerCase() : "";

  return (
    code === "42501" ||
    message.includes("blocked_user") ||
    details.includes("blocked_user")
  );
}

function shouldFallbackToLegacySend(err: unknown): boolean {
  if (!isRecord(err)) return false;
  const code = typeof err.code === "string" ? err.code : "";
  const status = Number(err.status ?? 0);
  const full = `${String(err.message || "")} ${String(err.details || "")}`.toLowerCase();

  // Fallback only on v11 infra/config issues; business rejections should remain explicit.
  if (code === "42883" || code === "PGRST202" || code === "PGRST301") return true;
  if (isTableMissingError({ code, message: String(err.message ?? "") })) return true;
  if (status === 404 && (full.includes("chat_send_message_v11") || full.includes("schema cache"))) return true;
  if (status === 400 && full.includes("chat_send_message_v11") && (full.includes("schema") || full.includes("column") || full.includes("relation"))) return true;
  if (full.includes("chat_send_message_v11") && (full.includes("does not exist") || full.includes("schema cache"))) return true;
  if (full.includes("permission denied") && full.includes("chat_send_message_v11")) return true;

  return false;
}

function shouldFallbackRejectedV11Ack(errorCode: unknown): boolean {
  const code = String(errorCode ?? "").toUpperCase();
  if (!code) return true;
  // Do not mask real authorization/business denials.
  if (code === "ERR_FORBIDDEN" || code === "ERR_UNAUTHORIZED") return false;
  // Invalid-argument / protocol mismatches should degrade to v1.
  if (code === "ERR_INVALID_ARGUMENT") return true;
  return true;
}

const TELEGRAM_MAX_MESSAGE_CHARS = 4096;
const TELEGRAM_MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;

export interface ChatMessage {
  id: string;
  client_msg_id?: string | null;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  edited_at?: string | null;
  seq?: number | null;
  media_url?: string | null;
  media_type?: string | null; // 'voice', 'video_circle', 'image'
  duration_seconds?: number | null;
  shared_post_id?: string | null;
  shared_reel_id?: string | null;
  disappear_in_seconds?: number | null;
  disappear_at?: string | null;
  disappeared?: boolean | null;
  is_silent?: boolean | null;
  /** Серверный статус доставки (заполнен после сохранения в БД) */
  delivery_status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | null;
  poll_id?: string | null;
  is_encrypted?: boolean | null;
  ttl_seconds?: number | null;
  file_name?: string | null;
  file_size?: number | null;
  metadata?: Record<string, unknown> | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_accuracy_m?: number | null;
  location_is_live?: boolean | null;
  message_effect?: string | null;
}

export type { DeliveryStatusMap };

export interface Conversation {
  id: string;
  created_at: string;
  updated_at: string;
  participants: {
    user_id: string;
    profile?: {
      display_name: string | null;
      avatar_url: string | null;
    };
  }[];
  last_message?: ChatMessage;
  unread_count: number;
}

export function useConversations() {
  const { user } = useAuth();
  const chatRpc = getChatRpcClient();
  const briefClient = supabase as unknown as UserBriefClient;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refetchTimerRef = useRef<number | null>(null);
  const refetchInFlightRef = useRef(false);

  const mapWithConcurrency = useCallback(async <T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T) => Promise<R>
  ): Promise<R[]> => {
    if (items.length === 0) return [];
    const results: R[] = new Array(items.length);
    let nextIndex = 0;

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const currentIndex = nextIndex++;
        if (currentIndex >= items.length) return;
        results[currentIndex] = await mapper(items[currentIndex]);
      }
    });

    await Promise.all(workers);
    return results;
  }, []);

  const withTimeout = async <T,>(label: string, p: PromiseLike<T>, ms = 20000): Promise<T> => {
    let t: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
      t = window.setTimeout(() => reject(new Error(`Timeout at step: ${label}`)), ms);
    });
    try {
      return await Promise.race([p, timeout]);
    } finally {
      if (t) window.clearTimeout(t);
    }
  };

  const toParticipantProfile = useCallback(
    (
      participantUserId: string,
      briefMap: ReadonlyMap<string, UserBrief>,
      embedded?: { display_name?: string | null; avatar_url?: string | null; username?: string | null } | null
    ) => {
      const brief = resolveUserBrief(participantUserId, briefMap, embedded);
      return brief
        ? {
            display_name: brief.display_name,
            avatar_url: brief.avatar_url,
          }
        : undefined;
    },
    []
  );

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!user) {
      setConversations([]);
      setLoading(false);
      return;
    }

    try {
      const v11 = isChatProtocolV11EnabledForUser(user.id);

      if (v11) {
        bumpChatMetric("inbox_fetch_count_per_open", 1);
        let inboxRes = (await withTimeout(
          "chat_get_inbox_v11_with_pointers",
          chatRpc.rpc<unknown[]>("chat_get_inbox_v11_with_pointers", {
            p_limit: 200,
            p_cursor: null,
          }),
          20000
        ));
        if (inboxRes.error) {
          inboxRes = (await withTimeout(
            "chat_get_inbox_v11",
            chatRpc.rpc<unknown[]>("chat_get_inbox_v11", {
              p_limit: 200,
              p_cursor: null,
            }),
            20000
          ));
        }
        const inboxRows = inboxRes.data;
        const inboxErr = inboxRes.error;
        if (inboxErr) throw inboxErr;

        const rows = toRecordArray(inboxRows);
        const conversationIds = rows
          .map((row) => getStringField(row, "dialog_id"))
          .filter((id): id is string => Boolean(id));
        if (conversationIds.length === 0) {
          setConversations([]);
          return;
        }

        const [convRes, allPartRes] = await withTimeout(
          "batch_v11",
          Promise.all([
            supabase.from("conversations").select("*").in("id", conversationIds),
            supabase.from("conversation_participants").select("conversation_id, user_id").in("conversation_id", conversationIds),
          ]),
          20000
        );
        if (convRes.error) throw convRes.error;
        if (allPartRes.error) throw allPartRes.error;

        const convById = new Map((convRes.data || []).map((conversation) => [String(conversation.id), conversation]));
        const allParticipants = allPartRes.data || [];

        const userIds = [...new Set(allParticipants.map((p) => p.user_id))];
        const briefMap = await fetchUserBriefMap(userIds, briefClient);

        const convs: Conversation[] = rows
          .map((row) => {
            const id = getStringField(row, "dialog_id");
            if (!id) return null;
            const conv = convById.get(id);
            if (!conv) return null;

            const participants = allParticipants
              .filter((p) => p.conversation_id === id)
              .map((p) => ({
                user_id: p.user_id,
                profile: toParticipantProfile(p.user_id, briefMap),
              }));

            const activitySeq = getNumberField(row, "activity_seq") ?? 0;
            const preview = getStringField(row, "preview") ?? "";
            const lastSenderId = getStringField(row, "last_sender_id") ?? "";
            const peerLastReadSeq = getNumberField(row, "peer_last_read_seq") ?? 0;
            const isReadByPeer = activitySeq > 0 && peerLastReadSeq >= activitySeq;
            const syntheticLastMessage: ChatMessage | undefined =
              activitySeq > 0 || preview
                ? {
                    id: `projection:${id}:${activitySeq}`,
                    conversation_id: id,
                    sender_id: lastSenderId,
                    content: preview,
                    is_read: isReadByPeer,
                    created_at: String(conv.updated_at || conv.created_at || new Date().toISOString()),
                    seq: activitySeq || null,
                  }
                : undefined;

            return {
              id,
              created_at: String(conv.created_at),
              updated_at: String(conv.updated_at),
              participants,
              last_message: syntheticLastMessage,
              unread_count: getNumberField(row, "unread_count") ?? 0,
            } as Conversation;
          })
          .filter(Boolean) as Conversation[];

        setConversations(convs);
        return;
      }

      // Inbox is server-first and avoids N+1: one RPC returns rollup + unread + participants.
      const inboxRes = (await withTimeout(
        "chat_get_inbox_v2",
        chatRpc.rpc<unknown[]>("chat_get_inbox_v2", {
          p_limit: 200,
          p_cursor_seq: null,
        }),
        20000
      ));

      if (inboxRes.error) throw inboxRes.error;

      const rows = toRecordArray(inboxRes.data);
      const lastMessageIds = rows
        .map((row) => getStringField(row, "last_message_id"))
        .filter((id: string | null): id is string => Boolean(id));

      const lastMessagesById = new Map<string, ChatMessage>();
      if (lastMessageIds.length > 0) {
        const lastMessagesRes = await withTimeout(
          "inbox_last_messages_v2",
          supabase
            .from("messages")
            .select(
              "id, conversation_id, sender_id, content, is_read, created_at, seq, media_url, media_type, duration_seconds, shared_post_id, shared_reel_id"
            )
            .in("id", lastMessageIds),
          20000
        );

        if (lastMessagesRes.error) throw lastMessagesRes.error;
        for (const m of lastMessagesRes.data || []) {
          const id = String(m.id);
          lastMessagesById.set(id, applyLegacyEnvelopeFallback({
            id,
            conversation_id: String(m.conversation_id),
            sender_id: String(m.sender_id || ""),
            content: String(m.content || ""),
            is_read: Boolean(m.is_read),
            created_at: String(m.created_at || new Date().toISOString()),
            seq: typeof m.seq === "number" ? m.seq : Number(m.seq || 0) || 0,
            media_url: (m.media_url ?? null) as string | null,
            media_type: (m.media_type ?? null) as string | null,
            duration_seconds: (m.duration_seconds ?? null) as number | null,
            shared_post_id: (m.shared_post_id ?? null) as string | null,
            shared_reel_id: (m.shared_reel_id ?? null) as string | null,
          }));
        }
      }

      const participantIds = [...new Set(rows.flatMap((row) => {
        const participantsRaw = getArrayField(row, "participants");
        return participantsRaw
          .map((participant) => isRecord(participant) ? getStringField(participant, "user_id") : null)
          .filter((x): x is string => x !== null);
      }))];
      const participantBriefMap = await fetchUserBriefMap(participantIds, briefClient);

      const mappedConversations: Conversation[] = rows.map((row) => {
        const participantsRaw = getArrayField(row, "participants");
        const participants = participantsRaw.flatMap((participant) => {
          if (!isRecord(participant)) return [];
          const participantUserId = getStringField(participant, "user_id") ?? "";
          const embeddedProfile = getRecordField(participant, "profile");
          return [{
            user_id: participantUserId,
            profile: toParticipantProfile(participantUserId, participantBriefMap, {
              display_name: embeddedProfile ? getStringField(embeddedProfile, "display_name") : null,
              avatar_url: embeddedProfile ? getStringField(embeddedProfile, "avatar_url") : null,
              username: embeddedProfile ? getStringField(embeddedProfile, "username") : null,
            }),
          }];
        });

        const lastMessageId = getStringField(row, "last_message_id") ?? "";
        const lastFromDb = lastMessageId ? lastMessagesById.get(lastMessageId) : undefined;
        const seqSource = lastFromDb?.seq ?? getNumberField(row, "last_seq") ?? 0;
        const lastMessage: ChatMessage | undefined = lastMessageId
          ? applyLegacyEnvelopeFallback({
              id: lastMessageId,
              conversation_id: getStringField(row, "conversation_id") ?? "",
              sender_id: String(lastFromDb?.sender_id || getStringField(row, "last_sender_id") || ""),
              content: String(lastFromDb?.content || getStringField(row, "last_preview_text") || ""),
              is_read: Boolean(lastFromDb?.is_read ?? false),
              created_at: String(lastFromDb?.created_at || getStringField(row, "last_created_at") || getStringField(row, "updated_at") || new Date().toISOString()),
              seq: typeof seqSource === "number" ? Number(seqSource) : Number(seqSource) || 0,
              media_url: lastFromDb?.media_url ?? null,
              media_type: lastFromDb?.media_type ?? null,
              duration_seconds: lastFromDb?.duration_seconds ?? null,
              shared_post_id: lastFromDb?.shared_post_id ?? null,
              shared_reel_id: lastFromDb?.shared_reel_id ?? null,
            })
          : undefined;

        return {
          id: getStringField(row, "conversation_id") ?? "",
          created_at: String(getStringField(row, "updated_at") || new Date().toISOString()),
          updated_at: String(getStringField(row, "updated_at") || new Date().toISOString()),
          participants,
          last_message: lastMessage,
          unread_count: getNumberField(row, "unread_count") ?? 0,
        };
      });

      setConversations(mappedConversations);
    } catch (error) {
      logger.error("Error fetching conversations:", error);
      const msg = getErrorMessage(error);
      // Helpful hint when the external project does not have the expected schema
      if (msg.includes("schema cache") || msg.includes("Could not find the table")) {
        setError(
          "В вашем Supabase проекте не создана схема чатов (таблица conversation_participants не найдена). Выполните SQL-миграцию со схемой чатов/сообщений и обновите страницу."
        );
      } else {
        setError(msg);
      }
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [user]);


  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const scheduleConversationsRefetch = useCallback(() => {
    if (refetchTimerRef.current != null) return;
    refetchTimerRef.current = window.setTimeout(() => {
      refetchTimerRef.current = null;
      if (document.hidden) return;
      if (refetchInFlightRef.current) return;
      refetchInFlightRef.current = true;
      Promise.resolve(fetchConversations()).finally(() => {
        refetchInFlightRef.current = false;
      });
    }, 300);
  }, [fetchConversations]);

  // Realtime subscription for conversation updates
  useEffect(() => {
    if (!user) return;

    const v11 = isChatProtocolV11EnabledForUser(user.id);
    const channel = v11
      ? supabase
          .channel("conversations-updates-v11")
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "chat_inbox_projection",
              filter: `user_id=eq.${user.id}`,
            },
            () => {
              scheduleConversationsRefetch();
            }
          )
          .subscribe((status) => {
            if (status === "SUBSCRIBED") { scheduleConversationsRefetch(); return; }
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              logger.warn("chat.conversations_realtime_failed", { status, protocol: v11 ? "v11" : "legacy" });
              scheduleConversationsRefetch();
            }
          })
      : supabase
          // Subscribe to conversation_participants filtered by current user —
          // fires only when this user's conversations change (new message bumps updated_at).
          .channel(`conversations-updates:${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "conversation_participants",
              filter: `user_id=eq.${user.id}`,
            },
            () => {
              scheduleConversationsRefetch();
            }
          )
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "messages",
            },
            () => {
              // New message in any conversation — refetch to update last_message + unread_count
              scheduleConversationsRefetch();
            }
          )
          .subscribe((status) => {
            if (status === "SUBSCRIBED") { scheduleConversationsRefetch(); return; }
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              logger.warn("chat.conversations_realtime_failed", { status, protocol: "legacy" });
              scheduleConversationsRefetch();
            }
          });

    return () => {
      if (refetchTimerRef.current != null) {
        window.clearTimeout(refetchTimerRef.current);
        refetchTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [user, fetchConversations, scheduleConversationsRefetch]);

  return { conversations, loading, error, refetch: fetchConversations };
}

export function useMessages(conversationId: string | null) {
  const { user } = useAuth();
  const chatRpc = getChatRpcClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const recoveryPolicy = getChatV11RecoveryPolicyConfig();
  const pollInFlightRef = useRef(false);
  const pendingLocalByClientIdRef = useRef<Map<string, ChatMessage>>(new Map());
  const inFlightFingerprintRef = useRef<Set<string>>(new Set());
  const lastRealtimeEventAtRef = useRef<number>(Date.now());

  const deliveredMaxSeqRef = useRef<number>(0);
  const deliveredAckTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (deliveredAckTimerRef.current != null) {
        window.clearTimeout(deliveredAckTimerRef.current);
      }
    };
  }, []);

  const scheduleDeliveredAck = useCallback(
    (seq: number) => {
      if (!user || !conversationId) return;
      if (!Number.isFinite(seq) || seq <= 0) return;
      if (isChatProtocolV11EnabledForUser(user.id)) return;

      deliveredMaxSeqRef.current = Math.max(deliveredMaxSeqRef.current, seq);

      if (deliveredAckTimerRef.current != null) return;
      deliveredAckTimerRef.current = window.setTimeout(() => {
        const upTo = deliveredMaxSeqRef.current;
        deliveredAckTimerRef.current = null;
        void (async () => {
          try {
            await chatRpc.rpc<unknown>("ack_delivered_v1", {
              p_conversation_id: conversationId,
              p_up_to_seq: upTo,
            });
          } catch (error) {
            logger.warn("chat.ack_delivered_failed", { error, conversationId, upTo });
          }
        })();
      }, 600);
    },
    [conversationId, user]
  );
  const recoveryServiceRef = useRef<ChatV11RecoveryService | null>(null);
  const recoveryPolicyMetricSentRef = useRef(false);

  const sortMessages = useCallback((list: ChatMessage[]): ChatMessage[] => {
    const next = [...list];
    next.sort((a, b) => {
      const aSeq = typeof a.seq === "number" ? a.seq : null;
      const bSeq = typeof b.seq === "number" ? b.seq : null;
      if (aSeq != null && bSeq != null && aSeq !== bSeq) return aSeq - bSeq;
      const aTime = Date.parse(a.created_at);
      const bTime = Date.parse(b.created_at);
      if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && aTime !== bTime) return aTime - bTime;
      return a.id.localeCompare(b.id);
    });
    return next;
  }, []);

  const isIdempotencySchemaMissing = (err: unknown) => {
    const msg = getErrorMessage(err).toLowerCase();
    return (
      msg.includes("client_msg_id") ||
      msg.includes("on conflict") ||
      msg.includes("no unique") ||
      msg.includes("no unique or exclusion constraint") ||
      msg.includes("could not find the")
    );
  };

  const fetchMessages = useCallback(async () => {
    if (!conversationId || !user) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setFetchError(null);

    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("seq", { ascending: true })
        .limit(200);

      if (error) throw error;

      const serverMessages = sortMessages((data || []).map((m) => applyLegacyEnvelopeFallback({
        ...(m as ChatMessage),
        content: sanitizeReceivedText(m.content),
      })));
      const serverClientIds = new Set(
        serverMessages
          .map((m) => (typeof m.client_msg_id === "string" ? m.client_msg_id : null))
          .filter(Boolean) as string[]
      );

      // Merge optimistic/pending local messages to avoid "send delay" and flicker during polling.
      const pending = pendingLocalByClientIdRef.current;
      const merged: ChatMessage[] = [...serverMessages];
      for (const [clientMsgId, localMsg] of pending.entries()) {
        if (serverClientIds.has(clientMsgId)) {
          pending.delete(clientMsgId);
          continue;
        }

        // If idempotency schema isn't applied yet, server rows won't have client_msg_id.
        // Best-effort: consider it delivered if a matching (sender+content) message appears near the same time.
        const localTime = Date.parse(localMsg.created_at);
        const hasNearMatch = serverMessages.some((m) => {
          if (m.sender_id !== localMsg.sender_id) return false;
          if ((m.content || "") !== (localMsg.content || "")) return false;
          const t = Date.parse(m.created_at);
          if (Number.isNaN(localTime) || Number.isNaN(t)) return false;
          return Math.abs(t - localTime) <= 10_000;
        });
        if (hasNearMatch) {
          pending.delete(clientMsgId);
          continue;
        }

        merged.push(localMsg);
      }

      setMessages(sortMessages(merged));
    } catch (error) {
      logger.error("Error fetching messages:", error);
      setFetchError(error instanceof Error ? error.message : "Ошибка загрузки сообщений");
    } finally {
      setLoading(false);
    }
  }, [conversationId, user, sortMessages]);

  const fetchMessagesRef = useRef(fetchMessages);
  useEffect(() => {
    fetchMessagesRef.current = fetchMessages;
  }, [fetchMessages]);

  const runV11Recovery = useCallback(
    async (params: { deviceId: string; clientWriteSeq: number; clientMsgId: string }) => {
      if (!conversationId) return;

      const { deviceId, clientWriteSeq, clientMsgId } = params;
      const clearLocalOptimistic = () => {
        pendingLocalByClientIdRef.current.delete(clientMsgId);
        setMessages((prev) => prev.filter((m) => !(m.id.startsWith("local:") && m.client_msg_id === clientMsgId)));
      };

      const { data: statusRows } = await chatRpc.rpc<unknown[]>("chat_status_write_v11", {
        p_device_id: deviceId,
        p_client_write_seq: clientWriteSeq,
      });
      const status = decodeChatWriteStatus(Array.isArray(statusRows) ? statusRows[0] : null);
      if (status?.msgId) {
        const { data: msgRow } = await supabase.from("messages").select("*").eq("id", status.msgId).maybeSingle();
        if (msgRow) {
          const returned = msgRow as unknown as ChatMessage;
          pendingLocalByClientIdRef.current.delete(clientMsgId);
          setMessages((prev) => {
            const withoutLocal = prev.filter((m) => !(m.id.startsWith("local:") && m.client_msg_id === clientMsgId));
            if (withoutLocal.some((m) => m.id === returned.id)) return withoutLocal;
            return sortMessages([...withoutLocal, returned]);
          });
          return;
        }
      }

      const { error: resyncErr } = await chatRpc.rpc<unknown[]>("chat_resync_stream_v11", {
        p_stream_id: `dialog:${conversationId}`,
        p_since_event_seq: 0,
        p_limit: 200,
      });

      if (!resyncErr) {
        bumpChatMetric("forced_resync_count", 1);
        clearLocalOptimistic();
        void fetchMessages();
        return;
      }

      const recoveryAction = resolveChatV11RecoveryAction(resyncErr);
      if (recoveryAction.kind === "retry_later") {
        return { deferredMs: recoveryAction.retryAfterMs };
      }
      if (recoveryAction.kind === "rethrow") {
        throw resyncErr;
      }

      const { data: fullRows, error: fullErr } = await chatRpc.rpc<unknown[]>("chat_full_state_dialog_v11", {
        p_dialog_id: conversationId,
        p_device_id: deviceId,
        p_message_limit: 200,
      });
      if (fullErr) throw fullErr;

      const full = Array.isArray(fullRows) ? fullRows[0] : null;
      const snapshot = isRecord(full) ? getRecordField(full, "snapshot") : null;
      const snapshotMessages = decodeChatFullSnapshotMessages(snapshot ? snapshot.messages : null)
        .map((message) => ({
          id: message.msgId,
          conversation_id: conversationId,
          sender_id: message.senderId,
          content: sanitizeReceivedText(message.content),
          is_read: true,
          created_at: message.createdAt,
          seq: message.msgSeq,
        }));

      clearLocalOptimistic();
      setMessages(sortMessages(snapshotMessages));
      bumpChatMetric("forced_resync_count", 1);
      void fetchMessages();
      return;
    },
    [conversationId, fetchMessages, sortMessages]
  );

  const runV11RecoveryRef = useRef(runV11Recovery);
  useEffect(() => {
    runV11RecoveryRef.current = runV11Recovery;
  }, [runV11Recovery]);

  useEffect(() => {
    if (!recoveryServiceRef.current) {
      recoveryServiceRef.current = new ChatV11RecoveryService({
        onAckTimeout: () => {
          bumpChatMetric("ack_without_receipt_10s_rate", 1);
        },
        runStep: (ctx) => runV11RecoveryRef.current(ctx),
        onFailure: (ctx) => {
          pendingLocalByClientIdRef.current.delete(ctx.clientMsgId);
          setMessages((prev) => prev.filter((m) => !(m.id.startsWith("local:") && m.client_msg_id === ctx.clientMsgId)));
          void fetchMessagesRef.current();
        },
        maxAttempts: recoveryPolicy.maxAttempts,
        retryPolicy: {
          minDelayMs: recoveryPolicy.minDelayMs,
          maxDelayMs: recoveryPolicy.maxDelayMs,
          exponentialBaseMs: recoveryPolicy.exponentialBaseMs,
          jitterRatio: recoveryPolicy.jitterRatio,
        },
      });
    }

    return () => {
      recoveryServiceRef.current?.clearAll();
      recoveryServiceRef.current = null;
    };
  }, [
    recoveryPolicy.exponentialBaseMs,
    recoveryPolicy.jitterRatio,
    recoveryPolicy.maxAttempts,
    recoveryPolicy.maxDelayMs,
    recoveryPolicy.minDelayMs,
  ]);

  useEffect(() => {
    if (!user) return;
    if (!isChatProtocolV11EnabledForUser(user.id)) return;
    if (recoveryPolicyMetricSentRef.current) return;
    recoveryPolicyMetricSentRef.current = true;

    observeChatMetric("recovery_policy_snapshot", recoveryPolicy.maxAttempts, {
      min_delay_ms: recoveryPolicy.minDelayMs,
      max_delay_ms: recoveryPolicy.maxDelayMs,
      exponential_base_ms: recoveryPolicy.exponentialBaseMs,
      jitter_ratio: recoveryPolicy.jitterRatio,
    });
  }, [user, recoveryPolicy]);

  const clearPendingReceiptWatch = useCallback((clientWriteSeq: number) => {
    recoveryServiceRef.current?.clear(clientWriteSeq);
  }, []);

  useEffect(() => {
    deliveredMaxSeqRef.current = 0;
    fetchMessages();
  }, [fetchMessages]);

  // Fallback polling: ensures the other side sees new messages even if Realtime
  // is flaky/blocked (some mobile webviews, VPNs, captive portals).
  useEffect(() => {
    if (!conversationId || !user) return;

    if (isChatProtocolV11EnabledForUser(user.id)) {
      const deviceId = getOrCreateChatDeviceId();
      void chatRpc
        .rpc<unknown>("chat_set_subscription_mode_v11", {
          p_device_id: deviceId,
          p_dialog_id: conversationId,
          p_mode: "active",
        })
        .catch((err: unknown) => {
          logger.debug("chat: set subscription mode failed", { mode: "active", err });
        });

      return () => {
        void chatRpc
          .rpc<unknown>("chat_set_subscription_mode_v11", {
            p_device_id: deviceId,
            p_dialog_id: conversationId,
            p_mode: "background",
          })
          .catch((err: unknown) => {
            logger.debug("chat: set subscription mode failed", { mode: "background", err });
          });
      };
    }

    return undefined;
  }, [conversationId, user]);

  useEffect(() => {
    if (!conversationId || !user) return;

    let timerId: number | null = null;
    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled) return;
      if (document.hidden) return; // паузим при скрытой вкладке
      const now = Date.now();
      const staleMs = now - lastRealtimeEventAtRef.current;
      const baseMs = staleMs > 12000 ? 3000 : 7000;
      const jitterMs = Math.floor(Math.random() * 700);
      timerId = window.setTimeout(() => {
        if (cancelled) return;
        if (!pollInFlightRef.current) {
          pollInFlightRef.current = true;
          Promise.resolve(fetchMessages()).finally(() => {
            pollInFlightRef.current = false;
            scheduleNext();
          });
          return;
        }
        scheduleNext();
      }, baseMs + jitterMs);
    };

    const onVisibilityChange = () => {
      if (cancelled) return;
      if (!document.hidden) {
        // вернулись — один fetch + возобновить polling
        if (!pollInFlightRef.current) {
          pollInFlightRef.current = true;
          Promise.resolve(fetchMessages()).finally(() => {
            pollInFlightRef.current = false;
            scheduleNext();
          });
        } else {
          scheduleNext();
        }
      } else {
        // ушли — отменить таймер
        if (timerId != null) {
          window.clearTimeout(timerId);
          timerId = null;
        }
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    scheduleNext();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timerId != null) {
        window.clearTimeout(timerId);
      }
    };
  }, [conversationId, user, fetchMessages]);

  // Subscribe to realtime messages
  useEffect(() => {
    if (!conversationId) return;

    let channel: RealtimeChannel;

    const setupSubscription = () => {
      channel = supabase
        .channel(`messages:${conversationId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
              const newMessage = decodeRealtimeChatMessage(payload.new);
              if (!newMessage) return;
            lastRealtimeEventAtRef.current = Date.now();
            // Sanitize received message content to prevent mojibake display
            if (newMessage?.content) {
              newMessage.content = sanitizeReceivedText(newMessage.content);
            }
            if (newMessage?.client_msg_id) {
              pendingLocalByClientIdRef.current.delete(newMessage.client_msg_id);
            }

            // Delivered ACK (user-level): confirm receipt up to seq for incoming messages.
            if (user?.id && newMessage?.sender_id && newMessage.sender_id !== user.id) {
              const s = typeof newMessage.seq === "number" ? newMessage.seq : Number(newMessage.seq || 0);
              if (Number.isFinite(s) && s > 0) {
                scheduleDeliveredAck(s);
              }
            }

            // Prevent duplicates by checking if message already exists
            setMessages((prev) => {
              const clientMsgId = newMessage?.client_msg_id ?? null;
              let withoutOptimistic = clientMsgId
                ? prev.filter((m) => !(m.id.startsWith("local:") && m.client_msg_id === clientMsgId))
                : prev;

              // If server rows don't have client_msg_id (schema missing), reconcile via near-match.
              // This prevents temporary duplicates (local optimistic + server insert) for the same send.
              if (!clientMsgId && user?.id && newMessage?.sender_id === user.id) {
                const localMatches = findNearMatchOptimisticMessages(withoutOptimistic, newMessage);

                if (localMatches.length === 1) {
                  const localIds = new Set(localMatches.map((m) => m.id));
                  for (const lm of localMatches) {
                    if (lm.client_msg_id) pendingLocalByClientIdRef.current.delete(lm.client_msg_id);
                  }
                  withoutOptimistic = withoutOptimistic.filter((m) => !localIds.has(m.id));
                }
              }

              if (withoutOptimistic.some((m) => m.id === newMessage.id)) return withoutOptimistic;
              if (clientMsgId && withoutOptimistic.some((m) => m.client_msg_id === clientMsgId && !m.id.startsWith("local:"))) {
                return withoutOptimistic;
              }

              return sortMessages([...withoutOptimistic, newMessage]);
            });
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
              const updated = decodeRealtimeChatMessage(payload.new);
              if (!updated) return;
            lastRealtimeEventAtRef.current = Date.now();
            // Sanitize updated message content to prevent mojibake display
            if (updated?.content) {
              updated.content = sanitizeReceivedText(updated.content);
            }
            if (!updated?.id) return;

            if (updated?.client_msg_id) {
              pendingLocalByClientIdRef.current.delete(updated.client_msg_id);
            }

            setMessages((prev) => {
              const clientMsgId = updated?.client_msg_id ?? null;

              let withoutOptimistic = clientMsgId
                ? prev.filter((m) => !(m.id.startsWith("local:") && m.client_msg_id === clientMsgId))
                : prev;

              if (!clientMsgId && user?.id && updated?.sender_id === user.id) {
                const localMatches = findNearMatchOptimisticMessages(withoutOptimistic, updated);

                if (localMatches.length === 1) {
                  const localIds = new Set(localMatches.map((m) => m.id));
                  for (const lm of localMatches) {
                    if (lm.client_msg_id) pendingLocalByClientIdRef.current.delete(lm.client_msg_id);
                  }
                  withoutOptimistic = withoutOptimistic.filter((m) => !localIds.has(m.id));
                }
              }

              const idx = withoutOptimistic.findIndex((m) => m.id === updated.id);
              if (idx === -1) {
                // If we missed the INSERT event, add it.
                return sortMessages([...withoutOptimistic, updated]);
              }
              const next = [...withoutOptimistic];
              next[idx] = { ...next[idx], ...updated };
              return sortMessages(next);
            });
          },
        )
        // DELETE payload may not include conversation_id (replica identity), so filtering by conversation_id
        // can drop delete events. Subscribe without filter and remove only if the id exists in local list.
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "messages",
          },
          (payload) => {
            const deleted = decodeRealtimeDeletedChatMessage(payload.old);
            lastRealtimeEventAtRef.current = Date.now();
            if (!deleted?.id) return;
            setMessages((prev) => {
              if (!prev.some((m) => m.id === deleted.id)) return prev;
              return prev.filter((m) => m.id !== deleted.id);
            });
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            // Catch-up: подбираем сообщения, пришедшие пока подписка устанавливалась
            lastRealtimeEventAtRef.current = Date.now();
            void fetchMessages();
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            logger.warn("chat.realtime_subscription_failed", { conversationId, status });
            void fetchMessages();
          }
        });
    };

    setupSubscription();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [conversationId, fetchMessages, scheduleDeliveredAck, sortMessages, user?.id]);

  useEffect(() => {
    if (!user) return;
    if (!isChatProtocolV11EnabledForUser(user.id)) return;

    const channel = supabase
      .channel(`chat-receipts:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_receipts",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const receipt = decodeChatReceipt(payload.new);
          const seq = receipt?.clientWriteSeq ?? null;
          if (seq === null || !Number.isFinite(seq)) return;
          const latency = recoveryServiceRef.current?.acknowledgeReceipt(
            seq,
            receipt?.deviceId ?? ""
          );
          if (typeof latency !== "number") return;
          observeChatMetric("write_receipt_latency_ms", latency);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      recoveryServiceRef.current?.clearAll();
    };
  }, [user]);

  const sendMessage = async (content: string, opts?: { clientMsgId?: string; is_silent?: boolean; [key: string]: unknown }) => {
    const normalizedContent = canonicalizeOutgoingChatText(content);

    if (!conversationId || !user || !normalizedContent) {
      if (!user) throw new Error("CHAT_NOT_AUTHENTICATED");
      if (!conversationId) throw new Error("CHAT_CONVERSATION_NOT_SELECTED");
      throw new Error("CHAT_EMPTY_MESSAGE");
    }

    if (normalizedContent.length > TELEGRAM_MAX_MESSAGE_CHARS) {
      throw new Error(`CHAT_MESSAGE_TOO_LONG:${normalizedContent.length}`);
    }

    const probe = getLastChatSchemaProbe();
    if (probe && probe.ok === false) {
      logger.warn("[Chat] schema probe reported not-ok; continuing send with fallback paths", {
        probe,
      });
    }

    const clientMsgId = opts?.clientMsgId || crypto.randomUUID();
    const fingerprint = `${conversationId}:${user.id}:${normalizedContent}`;

    if (inFlightFingerprintRef.current.has(fingerprint)) return;
    inFlightFingerprintRef.current.add(fingerprint);

    let v11ClientWriteSeq: number | null = null;

    try {
      const hashtagVerdict = await checkHashtagsAllowedForText(normalizedContent);
      if (!hashtagVerdict.ok) {
        throw new Error(`HASHTAG_BLOCKED:${("blockedTags" in hashtagVerdict ? hashtagVerdict.blockedTags : []).join(", ")}`);
      }

      const optimistic: ChatMessage = {
        id: `local:${clientMsgId}`,
        client_msg_id: clientMsgId,
        conversation_id: conversationId,
        sender_id: user.id,
        content: normalizedContent,
        is_read: true,
        created_at: new Date().toISOString(),
        seq: null,
      };
      pendingLocalByClientIdRef.current.set(clientMsgId, optimistic);
      setMessages((prev) => sortMessages([...prev.filter((m) => m.client_msg_id !== clientMsgId), optimistic]));

      const v11 = isChatProtocolV11EnabledForUser(user.id);
      if (v11) {
        const deviceId = getOrCreateChatDeviceId();
        const clientWriteSeq = nextClientWriteSeq(user.id);
        v11ClientWriteSeq = clientWriteSeq;
        recoveryServiceRef.current?.arm({
          clientWriteSeq,
          clientMsgId,
          deviceId,
        });

        const { data: ackRows, error: ackErr } = await chatRpc.rpc<unknown[]>("chat_send_message_v11", {
          p_dialog_id: conversationId,
          p_device_id: deviceId,
          p_client_write_seq: clientWriteSeq,
          p_client_msg_id: clientMsgId,
          p_content: normalizedContent,
          p_client_sent_at: new Date().toISOString(),
        });
        if (ackErr) {
          if (shouldFallbackToLegacySend(ackErr)) {
            clearPendingReceiptWatch(clientWriteSeq);
            v11ClientWriteSeq = null;
            bumpChatMetric("v11_fallback_to_v1_count", 1);

            const { messageId } = await sendMessageV1({
              conversationId,
              clientMsgId,
              body: normalizedContent,
              isSilent: !!opts?.is_silent,
            });
            const { data: msgRow, error: msgErr } = await supabase.from("messages").select("*").eq("id", messageId).maybeSingle();
            if (msgErr || !msgRow) {
              logger.warn("chat: post-send fetch failed after v11 fallback; keeping optimistic message", {
                conversationId,
                clientMsgId,
                messageId,
                error: msgErr,
              });
              return;
            }

            const returned = msgRow as unknown as ChatMessage;
            pendingLocalByClientIdRef.current.delete(clientMsgId);
            setMessages((prev) => {
              const withoutLocal = prev.filter((m) => !(m.id.startsWith("local:") && m.client_msg_id === clientMsgId));
              if (withoutLocal.some((m) => m.id === returned.id)) return withoutLocal;
              return sortMessages([...withoutLocal, returned]);
            });
            return;
          }
          throw ackErr;
        }

        const ack = decodeChatSendAck(Array.isArray(ackRows) ? ackRows[0] : null);
        const ackStatus = ack?.ackStatus ?? "";

        if (ackStatus === "accepted" || ackStatus === "duplicate") {
          const ackMsgId = ack?.msgId ?? null;
          if (ackMsgId) {
            const { data: msgRow, error: msgErr } = await supabase.from("messages").select("*").eq("id", ackMsgId).maybeSingle();
            if (msgErr) {
              logger.warn("chat: ack fetch failed; keeping optimistic message", {
                conversationId,
                clientMsgId,
                ackMsgId,
                error: msgErr,
              });
              return;
            }
            if (msgRow) {
              const returned = msgRow as unknown as ChatMessage;
              pendingLocalByClientIdRef.current.delete(clientMsgId);
              clearPendingReceiptWatch(clientWriteSeq);
              setMessages((prev) => {
                const withoutLocal = prev.filter((m) => !(m.id.startsWith("local:") && m.client_msg_id === clientMsgId));
                if (withoutLocal.some((m) => m.id === returned.id)) return withoutLocal;
                return sortMessages([...withoutLocal, returned]);
              });
            }
          }

          // If msg_id is missing, keep optimistic row; recovery/Realtime will reconcile it.
          return;
        }

        const rejectedCode = ack?.errorCode ?? ackStatus ?? "unknown";
        if (shouldFallbackRejectedV11Ack(rejectedCode)) {
          clearPendingReceiptWatch(clientWriteSeq);
          v11ClientWriteSeq = null;
          bumpChatMetric("v11_fallback_to_v1_count", 1);

          const { messageId } = await sendMessageV1({
            conversationId,
            clientMsgId,
            body: normalizedContent,
            isSilent: !!opts?.is_silent,
          });

          const { data: msgRow, error: msgErr } = await supabase.from("messages").select("*").eq("id", messageId).maybeSingle();
          if (msgErr || !msgRow) {
            logger.warn("chat: post-send fetch failed after v11 rejected fallback; keeping optimistic message", {
              conversationId,
              clientMsgId,
              messageId,
              rejectedCode,
              error: msgErr,
            });
            return;
          }

          const returned = msgRow as unknown as ChatMessage;
          pendingLocalByClientIdRef.current.delete(clientMsgId);
          setMessages((prev) => {
            const withoutLocal = prev.filter((m) => !(m.id.startsWith("local:") && m.client_msg_id === clientMsgId));
            if (withoutLocal.some((m) => m.id === returned.id)) return withoutLocal;
            return sortMessages([...withoutLocal, returned]);
          });
          return;
        }

        throw new Error(`CHAT_V11_SEND_REJECTED:${rejectedCode}`);
      }

      // falling back to legacy
      const { messageId } = await sendMessageV1({
        conversationId,
        clientMsgId,
        body: normalizedContent,
        isSilent: !!opts?.is_silent,
      });

      const { data: msgRow, error: msgErr } = await supabase.from("messages").select("*").eq("id", messageId).maybeSingle();
      if (msgErr || !msgRow) {
        logger.warn("chat: post-send fetch failed; keeping optimistic message", {
          conversationId,
          clientMsgId,
          messageId,
          error: msgErr,
        });
        return;
      }

      const returned = msgRow as unknown as ChatMessage;
      pendingLocalByClientIdRef.current.delete(clientMsgId);
      setMessages((prev) => {
        const withoutLocal = prev.filter((m) => !(m.id.startsWith("local:") && m.client_msg_id === clientMsgId));
        if (withoutLocal.some((m) => m.id === returned.id)) return withoutLocal;
        return sortMessages([...withoutLocal, returned]);
      });
    } catch (error) {
      if (clientMsgId) {
        pendingLocalByClientIdRef.current.delete(clientMsgId);
        setMessages((prev) => prev.filter((m) => !(m.id.startsWith("local:") && m.client_msg_id === clientMsgId)));
      }
      if (v11ClientWriteSeq != null) {
        clearPendingReceiptWatch(v11ClientWriteSeq);
      }
      throw error;
    } finally {
      inFlightFingerprintRef.current.delete(fingerprint);
    }
  };

  const sendMediaMessage = async (
    file: File,
    mediaType: 'voice' | 'video_circle' | 'image' | 'video' | 'document',
    durationSeconds?: number,
    opts?: { albumId?: string; caption?: string },
  ) => {
    if (!conversationId || !user) return { error: 'Not authenticated' };

    if (file.size > TELEGRAM_MAX_FILE_BYTES) {
      const error = 'CHAT_FILE_TOO_LARGE';
      toast.error("Файл слишком большой", {
        description: "Максимальный размер файла: 2 ГБ",
      });
      return { error };
    }

    const probe = getLastChatSchemaProbe();
    if (probe && probe.ok === false) {
      logger.warn("[Chat] schema probe reported not-ok during media send; continuing", {
        probe,
      });
    }

    try {
      const fileExt = file.name.split('.').pop() || 'webm';
      const fileName = `${user.id}/${conversationId}/${Date.now()}.${fileExt}`;

      const uploadResult = await uploadMedia(file, { bucket: 'chat-media' });
      const publicUrl = uploadResult.url;

      const clientMsgId = crypto.randomUUID();
      const content = opts?.caption
        ? opts.caption
        : mediaType === 'voice'
          ? '🎤 Голосовое сообщение'
          : mediaType === 'video_circle'
            ? '🎬 Видео-кружок'
            : mediaType === 'video'
              ? '🎥 Видео'
              : '📷 Изображение';

      const envelopeData: Record<string, unknown> = {
        kind: 'media',
        text: content,
        media_type: mediaType,
        media_url: publicUrl,
        duration_seconds: durationSeconds ?? null,
      };
      if (opts?.albumId) {
        envelopeData.metadata = { album_id: opts.albumId };
      }

      const envelope = buildChatBodyEnvelope(envelopeData);

      const { messageId } = await sendMessageV1({
        conversationId,
        clientMsgId,
        body: envelope,
      });

      const { data: msgRow, error: msgErr } = await supabase.from("messages").select("*").eq("id", messageId).maybeSingle();
      if (msgErr) throw msgErr;
      if (msgRow) {
        const returned = msgRow as unknown as ChatMessage;
        setMessages((prev) => {
          if (prev.some((m) => m.id === returned.id)) return prev;
          return sortMessages([...prev, returned]);
        });
      }

      return { error: null };
    } catch (error) {
      logger.error("Error sending media message:", error);
      return { error: error instanceof Error ? error.message : 'Failed to send media' };
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!user) return { error: 'Not authenticated' };

    try {
      const { error } = await supabase
        .from("messages")
        .delete()
        .eq("id", messageId)
        .eq("sender_id", user.id); // Only allow deleting own messages

      if (error) throw error;

      // Remove from local state
      setMessages((prev) => prev.filter((m) => m.id !== messageId));

      return { error: null };
    } catch (error) {
      logger.error("Error deleting message:", error);
      return { error: error instanceof Error ? error.message : 'Failed to delete message' };
    }
  };

  const editMessage = async (messageId: string, newContent: string) => {
    if (!user) return { error: 'Not authenticated' };

    const trimmed = newContent.trim();
    if (!trimmed) return { error: 'Content cannot be empty' };

    // Validation: only own messages, not older than 48 hours
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return { error: 'Message not found' };
    if (msg.sender_id !== user.id) return { error: 'Cannot edit someone else message' };
    const ageMs = Date.now() - new Date(msg.created_at).getTime();
    if (ageMs > 48 * 60 * 60 * 1000) return { error: 'Message is too old to edit' };

    const now = new Date().toISOString();

    // Optimistic update
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, content: trimmed, edited_at: now } : m
      )
    );

    try {
      const { error } = await supabase
        .from("messages")
        .update({ content: trimmed, edited_at: now })
        .eq("id", messageId)
        .eq("sender_id", user.id);

      if (error) {
        // Rollback optimistic update
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, content: msg.content, edited_at: msg.edited_at ?? null } : m
          )
        );
        throw error;
      }

      return { error: null };
    } catch (error) {
      logger.error("Error editing message:", error);
      return { error: error instanceof Error ? error.message : 'Failed to edit message' };
    }
  };

  const {
    statusMap: deliveryStatusMap,
    markAsRead,
    markManyAsRead,
  } = useDeliveryStatus(conversationId);

  return {
    messages,
    loading,
    fetchError,
    sendMessage,
    sendMediaMessage,
    deleteMessage,
    editMessage,
    refetch: fetchMessages,
    deliveryStatusMap,
    markAsRead,
    markManyAsRead,
  };
}

export function useCreateConversation() {
  const { user } = useAuth();
  const chatRpc = getChatRpcClient();

  const createConversation = async (otherUserId: string) => {
    if (!user) return null;

    const probe = getLastChatSchemaProbe();
    if (probe && probe.ok === false) {
      logger.warn("[Chat] schema probe reported not-ok during DM creation; continuing", {
        probe,
      });
    }

    try {
      // Contract-only path: SECURITY DEFINER RPC is the ONLY supported way.
      // Client must never try to INSERT other participants directly (RLS is self-only).
      const rpcRes = await chatRpc.rpc<unknown>("get_or_create_dm", {
        target_user_id: otherUserId,
      });
      const rpcError = rpcRes.error;
      const rpcData = rpcRes.data;
      if (!rpcError && rpcData) {
        const id = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        if (id) return String(id);
      }

      if (rpcError && isBlockedDmError(rpcError)) {
        toast.error("Чат недоступен: пользователь в блокировке.");
        return null;
      }

      logger.error("[Chat] get_or_create_dm unavailable or returned empty result", {
        error: rpcError,
        dataType: Array.isArray(rpcData) ? "array" : typeof rpcData,
      });
      toast.error("Чат временно недоступен. Попробуйте позже.");
      return null;
    } catch (error) {
      logger.error("Error creating conversation:", error);

      if (isBlockedDmError(error)) {
        toast.error("Чат недоступен: пользователь в блокировке.");
        return null;
      }

      // Deterministic failure: do not attempt any legacy inserts.
      toast.error("Чат временно недоступен. Попробуйте позже.");
      return null;
    }
  };

  return { createConversation };
}

