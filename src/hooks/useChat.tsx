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
import { uploadMedia } from "@/lib/mediaUpload";
import { buildChatBodyEnvelope, sendMessageV1 } from "@/lib/chat/sendMessageV1";
import { sanitizeReceivedText } from "@/lib/text-encoding";
import { canonicalizeOutgoingChatText, repairBrokenLineWrapArtifacts } from "@/lib/chat/textPipeline";
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
import { fetchUserBriefMap, resolveUserBrief, type UserBrief } from "@/lib/users/userBriefs";
import { logger } from "@/lib/logger";

function getErrorMessage(err: unknown): string {
  if (!err) return "Unknown error";
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const anyErr = err as any;
    // PostgREST errors
    if (typeof anyErr.message === "string") return anyErr.message;
    if (typeof anyErr.error_description === "string") return anyErr.error_description;
    if (typeof anyErr.details === "string") return anyErr.details;
    try {
      return JSON.stringify(anyErr);
    } catch (_error) {
      return String(anyErr);
    }
  }
  return String(err);
}

function isBlockedDmError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as any;
  const code = typeof anyErr.code === "string" ? anyErr.code : "";
  const message = typeof anyErr.message === "string" ? anyErr.message.toLowerCase() : "";
  const details = typeof anyErr.details === "string" ? anyErr.details.toLowerCase() : "";

  return (
    code === "42501" ||
    message.includes("blocked_user") ||
    details.includes("blocked_user")
  );
}

function shouldFallbackToLegacySend(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as any;
  const code = typeof anyErr.code === "string" ? anyErr.code : "";
  const status = Number(anyErr.status ?? 0);
  const full = `${String(anyErr.message || "")} ${String(anyErr.details || "")}`.toLowerCase();

  // Fallback only on v11 infra/config issues; business rejections should remain explicit.
  if (code === "42883" || code === "PGRST202" || code === "PGRST301") return true;
  if (code === "42P01" || code === "42703" || code === "PGRST204" || code === "PGRST205") return true;
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

function normalizeBrokenVerticalText(text: string): string {
  return repairBrokenLineWrapArtifacts(text);
}

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
          (supabase as any).rpc("chat_get_inbox_v11_with_pointers", {
            p_limit: 200,
            p_cursor: null,
          }),
          20000
        )) as { data: any[] | null; error: any };
        if (inboxRes.error) {
          inboxRes = (await withTimeout(
            "chat_get_inbox_v11",
            (supabase as any).rpc("chat_get_inbox_v11", {
              p_limit: 200,
              p_cursor: null,
            }),
            20000
          )) as { data: any[] | null; error: any };
        }
        const inboxRows = inboxRes.data;
        const inboxErr = inboxRes.error;
        if (inboxErr) throw inboxErr;

        const rows = (Array.isArray(inboxRows) ? inboxRows : []) as any[];
        const conversationIds = rows.map((r) => String(r.dialog_id || "")).filter(Boolean);
        if (conversationIds.length === 0) {
          setConversations([]);
          return;
        }

        const [convRes, allPartRes] = await withTimeout<
          [
            { data: any[] | null; error: any },
            { data: { conversation_id: string; user_id: string }[] | null; error: any }
          ]
        >(
          "batch_v11",
          Promise.all([
            supabase.from("conversations").select("*").in("id", conversationIds),
            supabase.from("conversation_participants").select("conversation_id, user_id").in("conversation_id", conversationIds),
          ]),
          20000
        );
        if (convRes.error) throw convRes.error;
        if (allPartRes.error) throw allPartRes.error;

        const convById = new Map<string, any>((convRes.data || []).map((c: any) => [String(c.id), c]));
        const allParticipants = allPartRes.data || [];

        const userIds = [...new Set(allParticipants.map((p) => p.user_id))];
        const briefMap = await fetchUserBriefMap(userIds, supabase as any);

        const convs: Conversation[] = rows
          .map((row: any) => {
            const id = String(row.dialog_id);
            const conv = convById.get(id);
            if (!conv) return null;

            const participants = allParticipants
              .filter((p) => p.conversation_id === id)
              .map((p) => ({
                user_id: p.user_id,
                profile: toParticipantProfile(p.user_id, briefMap),
              }));

            const activitySeq = Number(row.activity_seq || 0);
            const preview = String(row.preview || "");
            const lastSenderId = String(row.last_sender_id || "");
            const peerLastReadSeq = Number(row.peer_last_read_seq || 0);
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
              unread_count: Number(row.unread_count || 0),
            } as Conversation;
          })
          .filter(Boolean) as Conversation[];

        setConversations(convs);
        return;
      }

      // Inbox is server-first and avoids N+1: one RPC returns rollup + unread + participants.
      const inboxRes = (await withTimeout(
        "chat_get_inbox_v2",
        (supabase as any).rpc("chat_get_inbox_v2", {
          p_limit: 200,
          p_cursor_seq: null,
        }),
        20000
      )) as { data: any[] | null; error: any };

      if (inboxRes.error) throw inboxRes.error;

      const rows = Array.isArray(inboxRes.data) ? inboxRes.data : [];
      const lastMessageIds = rows
        .map((r: any) => (r?.last_message_id ? String(r.last_message_id) : null))
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

        if ((lastMessagesRes as any).error) throw (lastMessagesRes as any).error;
        for (const m of ((lastMessagesRes as any).data || []) as any[]) {
          const id = String(m.id);
          lastMessagesById.set(id, {
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
          });
        }
      }

      const participantIds = [...new Set(rows.flatMap((r: any) => {
        const participantsRaw = Array.isArray(r?.participants) ? r.participants : [];
        return participantsRaw
          .map((p: any) => String(p?.user_id || ""))
          .filter(Boolean);
      }))];
      const participantBriefMap = await fetchUserBriefMap(participantIds, supabase as any);

      const mappedConversations: Conversation[] = rows.map((r: any) => {
        const participantsRaw = Array.isArray(r?.participants) ? r.participants : [];
        const participants = participantsRaw.map((p: any) => ({
          user_id: String(p?.user_id || ""),
          profile: toParticipantProfile(String(p?.user_id || ""), participantBriefMap, {
            display_name: (p?.profile?.display_name ?? null) as string | null,
            avatar_url: (p?.profile?.avatar_url ?? null) as string | null,
            username: (p?.profile?.username ?? null) as string | null,
          }),
        }));

        const lastMessageId = r?.last_message_id ? String(r.last_message_id) : "";
        const lastFromDb = lastMessageId ? lastMessagesById.get(lastMessageId) : undefined;
          const seqSource = lastFromDb?.seq ?? r.last_seq ?? 0;
        const lastMessage: ChatMessage | undefined = lastMessageId
          ? {
              id: lastMessageId,
              conversation_id: String(r.conversation_id),
              sender_id: String(lastFromDb?.sender_id || r.last_sender_id || ""),
              content: String(lastFromDb?.content || r.last_preview_text || ""),
              is_read: Boolean(lastFromDb?.is_read ?? false),
              created_at: String(lastFromDb?.created_at || r.last_created_at || r.updated_at || new Date().toISOString()),
            seq: typeof seqSource === "number" ? Number(seqSource) : Number(seqSource) || 0,
              media_url: lastFromDb?.media_url ?? null,
              media_type: lastFromDb?.media_type ?? null,
              duration_seconds: lastFromDb?.duration_seconds ?? null,
              shared_post_id: lastFromDb?.shared_post_id ?? null,
              shared_reel_id: lastFromDb?.shared_reel_id ?? null,
            }
          : undefined;

        return {
          id: String(r.conversation_id),
          created_at: String(r.updated_at || new Date().toISOString()),
          updated_at: String(r.updated_at || new Date().toISOString()),
          participants,
          last_message: lastMessage,
          unread_count: Number(r.unread_count || 0),
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
          .subscribe()
      : supabase
          .channel("conversations-updates")
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "conversations",
            },
            () => {
              scheduleConversationsRefetch();
            }
          )
          .subscribe();

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const recoveryPolicy = getChatV11RecoveryPolicyConfig();
  const pollInFlightRef = useRef(false);
  const pendingLocalByClientIdRef = useRef<Map<string, ChatMessage>>(new Map());
  const inFlightFingerprintRef = useRef<Set<string>>(new Set());
  const lastRealtimeEventAtRef = useRef<number>(Date.now());

  const deliveredMaxSeqRef = useRef<number>(0);
  const deliveredAckTimerRef = useRef<number | null>(null);

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
            await (supabase as any).rpc("ack_delivered_v1", {
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
      const aSeq = typeof (a as any).seq === "number" ? (a as any).seq : null;
      const bSeq = typeof (b as any).seq === "number" ? (b as any).seq : null;
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

    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("seq", { ascending: true });

      if (error) throw error;

      const serverMessages = sortMessages((data || []).map(m => ({
        ...m,
        content: sanitizeReceivedText(m.content)
      })) as ChatMessage[]);
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

      const { data: statusRows } = await (supabase as any).rpc("chat_status_write_v11", {
        p_device_id: deviceId,
        p_client_write_seq: clientWriteSeq,
      });
      const status = (Array.isArray(statusRows) ? statusRows[0] : null) as any;
      if (status?.msg_id) {
        const { data: msgRow } = await supabase.from("messages").select("*").eq("id", String(status.msg_id)).maybeSingle();
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

      const { error: resyncErr } = await (supabase as any).rpc("chat_resync_stream_v11", {
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

      const { data: fullRows, error: fullErr } = await (supabase as any).rpc("chat_full_state_dialog_v11", {
        p_dialog_id: conversationId,
        p_device_id: deviceId,
        p_message_limit: 200,
      });
      if (fullErr) throw fullErr;

      const full = (Array.isArray(fullRows) ? fullRows[0] : null) as any;
      const snapshot = full?.snapshot ?? null;
      const snapshotMessagesRaw = Array.isArray(snapshot?.messages) ? snapshot.messages : [];
      const snapshotMessages = snapshotMessagesRaw
        .map((m: any) => ({
          id: String(m?.msg_id ?? ""),
          conversation_id: conversationId,
          sender_id: String(m?.sender_id ?? ""),
          content: sanitizeReceivedText(String(m?.content ?? "")),
          is_read: true,
          created_at: String(m?.created_at ?? new Date().toISOString()),
          seq: typeof m?.msg_seq === "number" ? m.msg_seq : Number(m?.msg_seq || 0) || null,
        }))
        .filter((m: ChatMessage) => Boolean(m.id));

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
    fetchMessages();
  }, [fetchMessages]);

  // Fallback polling: ensures the other side sees new messages even if Realtime
  // is flaky/blocked (some mobile webviews, VPNs, captive portals).
  useEffect(() => {
    if (!conversationId || !user) return;

    if (isChatProtocolV11EnabledForUser(user.id)) {
      const deviceId = getOrCreateChatDeviceId();
      void (supabase as any)
        .rpc("chat_set_subscription_mode_v11", {
          p_device_id: deviceId,
          p_dialog_id: conversationId,
          p_mode: "active",
        })
        .catch(() => {
          // best-effort; chat remains functional without this hint
        });

      return () => {
        void (supabase as any)
          .rpc("chat_set_subscription_mode_v11", {
            p_device_id: deviceId,
            p_dialog_id: conversationId,
            p_mode: "background",
          })
          .catch(() => {
            // best-effort cleanup
          });
      };
    }
  }, [conversationId, user]);

  useEffect(() => {
    if (!conversationId || !user) return;

    let timerId: number | null = null;
    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled) return;
      const now = Date.now();
      const staleMs = now - lastRealtimeEventAtRef.current;
      const hidden = document.hidden;
      const baseMs = hidden ? 15000 : staleMs > 12000 ? 3000 : 7000;
      const jitterMs = Math.floor(Math.random() * 700);
      timerId = window.setTimeout(() => {
        if (cancelled) return;
        if (!document.hidden && !pollInFlightRef.current) {
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

    scheduleNext();

    return () => {
      cancelled = true;
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
            const newMessage = payload.new as ChatMessage;
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
                const serverTime = Date.parse(newMessage.created_at);
                const windowMs = 15_000;

                const localMatches = withoutOptimistic.filter((m) => {
                  if (!m.id.startsWith("local:")) return false;
                  if (m.sender_id !== newMessage.sender_id) return false;
                  if ((m.content || "") !== (newMessage.content || "")) return false;
                  const localTime = Date.parse(m.created_at);
                  if (Number.isNaN(serverTime) || Number.isNaN(localTime)) return false;
                  return Math.abs(serverTime - localTime) <= windowMs;
                });

                if (localMatches.length > 0) {
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
            const updated = payload.new as ChatMessage;
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
                const serverTime = Date.parse(updated.created_at);
                const windowMs = 15_000;

                const localMatches = withoutOptimistic.filter((m) => {
                  if (!m.id.startsWith("local:")) return false;
                  if (m.sender_id !== updated.sender_id) return false;
                  if ((m.content || "") !== (updated.content || "")) return false;
                  const localTime = Date.parse(m.created_at);
                  if (Number.isNaN(serverTime) || Number.isNaN(localTime)) return false;
                  return Math.abs(serverTime - localTime) <= windowMs;
                });

                if (localMatches.length > 0) {
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
            const deleted = payload.old as Partial<ChatMessage>;
            lastRealtimeEventAtRef.current = Date.now();
            if (!deleted?.id) return;
            setMessages((prev) => {
              if (!prev.some((m) => m.id === deleted.id)) return prev;
              return prev.filter((m) => m.id !== deleted.id);
            });
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") return;
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            // Fallback: if Realtime is flaky (VPN / captive portals), keep chat usable.
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
          const receipt = payload.new as any;
          const seq = Number(receipt?.client_write_seq);
          if (!Number.isFinite(seq)) return;
          const latency = recoveryServiceRef.current?.acknowledgeReceipt(
            seq,
            String(receipt?.device_id || "")
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

    const probe = getLastChatSchemaProbe();
    if (probe && probe.ok === false) {
      logger.warn("[Chat] schema probe reported not-ok; continuing send with fallback paths", {
        reason: probe.reason,
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

        const { data: ackRows, error: ackErr } = await (supabase as any).rpc("chat_send_message_v11", {
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

        const ack = (Array.isArray(ackRows) ? ackRows[0] : null) as any;
        const ackStatus = String(ack?.ack_status || "");

        if (ackStatus === "accepted" || ackStatus === "duplicate") {
          const ackMsgId = ack?.msg_id ? String(ack.msg_id) : null;
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

        const rejectedCode = String(ack?.error_code || ackStatus || "unknown");
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

  const sendMediaMessage = async (file: File, mediaType: 'voice' | 'video_circle' | 'image' | 'video', durationSeconds?: number) => {
    if (!conversationId || !user) return { error: 'Not authenticated' };

    const probe = getLastChatSchemaProbe();
    if (probe && probe.ok === false) {
      return { error: 'Chat service misconfigured' };
    }

    try {
      // Upload to storage
      const fileExt = file.name.split('.').pop() || 'webm';
      const fileName = `${user.id}/${conversationId}/${Date.now()}.${fileExt}`;

      const uploadResult = await uploadMedia(file, { bucket: 'chat-media' });
      const publicUrl = uploadResult.url;

      const clientMsgId = crypto.randomUUID();
      const content =
        mediaType === 'voice'
          ? '🎤 Голосовое сообщение'
          : mediaType === 'video_circle'
            ? '🎬 Видео-кружок'
            : mediaType === 'video'
              ? '🎥 Видео'
              : '📷 Изображение';

      const envelope = buildChatBodyEnvelope({
        kind: 'media',
        text: content,
        media_type: mediaType,
        media_url: publicUrl,
        duration_seconds: durationSeconds ?? null,
      });

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
      const { error } = await (supabase as any)
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
    sendMessage,
    sendMediaMessage,
    deleteMessage,
    editMessage,
    refetch: fetchMessages,
    /** Карта delivery_status для собственных сообщений: messageId → статус */
    deliveryStatusMap,
    /** Зафиксировать прочтение одного входящего сообщения (не своего) */
    markAsRead,
    /** Batch-фиксация прочтения входящих сообщений */
    markManyAsRead,
  };
}

export function useCreateConversation() {
  const { user } = useAuth();

  const createConversation = async (otherUserId: string) => {
    if (!user) return null;

    const probe = getLastChatSchemaProbe();
    if (probe && probe.ok === false) {
      toast.error("Chat service misconfigured: DM creation unavailable.");
      return null;
    }

    try {
      // Contract-only path: SECURITY DEFINER RPC is the ONLY supported way.
      // Client must never try to INSERT other participants directly (RLS is self-only).
      const rpcRes = await (supabase as any).rpc("get_or_create_dm", {
        target_user_id: otherUserId,
      });
      const rpcError = (rpcRes as any)?.error;
      const rpcData = (rpcRes as any)?.data;
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
      toast.error("Chat service misconfigured: DM creation unavailable.");
      return null;
    } catch (error) {
      logger.error("Error creating conversation:", error);

      if (isBlockedDmError(error)) {
        toast.error("Чат недоступен: пользователь в блокировке.");
        return null;
      }

      // Deterministic failure: do not attempt any legacy inserts.
      toast.error("Chat service misconfigured: DM creation unavailable.");
      return null;
    }
  };

  return { createConversation };
}

