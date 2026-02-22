import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import type { RealtimeChannel } from "@supabase/supabase-js";
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
    } catch {
      return String(anyErr);
    }
  }
  return String(err);
}

function normalizeBrokenVerticalText(text: string): string {
  const lines = text.split(/\r\n|\r|\n|\u2028|\u2029/);
  const nonEmpty = lines.map((line) => line.trim()).filter(Boolean);
  const isSingleGlyph = (s: string) => Array.from(s).length === 1;
  // If payload became "one symbol per line", stitch it back.
  // Use 2+ to also fix short cases like "О\nК".
  if (nonEmpty.length >= 2 && nonEmpty.length <= 64 && nonEmpty.every(isSingleGlyph)) {
    return nonEmpty.join("");
  }
  return text;
}

export interface ChatMessage {
  id: string;
  client_msg_id?: string | null;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  seq?: number | null;
  media_url?: string | null;
  media_type?: string | null; // 'voice', 'video_circle', 'image'
  duration_seconds?: number | null;
  shared_post_id?: string | null;
  shared_reel_id?: string | null;
}

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

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!user) {
      setConversations([]);
      setLoading(false);
      return;
    }

    try {
      console.log("[useConversations] start", { userId: user.id });
      const v11 = isChatProtocolV11EnabledForUser(user.id);

      if (v11) {
        bumpChatMetric("inbox_fetch_count_per_open", 1);
        const inboxRes = (await withTimeout(
          "chat_get_inbox_v11",
          (supabase as any).rpc("chat_get_inbox_v11", {
            p_limit: 200,
            p_cursor: null,
          }),
          20000
        )) as { data: any[] | null; error: any };
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
        const profilesRes =
          userIds.length > 0
            ? await withTimeout(
                "profiles_v11",
                supabase.from("profiles").select("user_id, display_name, avatar_url").in("user_id", userIds),
                20000
              )
            : { data: [], error: null };
        if ((profilesRes as any).error) throw (profilesRes as any).error;
        const profiles = (((profilesRes as any).data || []) as any[]).map((p) => ({
          user_id: p.user_id as string,
          display_name: (p.display_name ?? null) as string | null,
          avatar_url: (p.avatar_url ?? null) as string | null,
        }));

        const convs: Conversation[] = rows
          .map((row: any) => {
            const id = String(row.dialog_id);
            const conv = convById.get(id);
            if (!conv) return null;

            const participants = allParticipants
              .filter((p) => p.conversation_id === id)
              .map((p) => ({
                user_id: p.user_id,
                profile: profiles.find((pr) => pr.user_id === p.user_id),
              }));

            const activitySeq = Number(row.activity_seq || 0);
            const preview = String(row.preview || "");
            const syntheticLastMessage: ChatMessage | undefined =
              activitySeq > 0 || preview
                ? {
                    id: `projection:${id}:${activitySeq}`,
                    conversation_id: id,
                    sender_id: "",
                    content: preview,
                    is_read: true,
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
        console.log("[useConversations] done v11", { count: convs.length });
        return;
      }

      // Step 1: conversation IDs for current user
      const { data: participantData, error: partError } = await withTimeout(
        "participants",
        supabase
          .from("conversation_participants")
          .select("conversation_id")
          .eq("user_id", user.id),
        20000
      );

      if (partError) throw partError;

      const conversationIds = (participantData || []).map((p) => p.conversation_id);
      if (conversationIds.length === 0) {
        setConversations([]);
        return;
      }

      // Step 2: fetch conversations + participants
      const [convRes, allPartRes] = await withTimeout<[
        { data: any[] | null; error: any },
        { data: { conversation_id: string; user_id: string }[] | null; error: any }
      ]>(
        "batch",
        Promise.all([
          supabase
            .from("conversations")
            .select("*")
            .in("id", conversationIds)
            .order("updated_at", { ascending: false }),
          supabase
            .from("conversation_participants")
            .select("conversation_id, user_id")
            .in("conversation_id", conversationIds),
        ])
      );

      if (convRes.error) throw convRes.error;
      if (allPartRes.error) throw allPartRes.error;

      const convData = convRes.data || [];
      const allParticipants = allPartRes.data || [];

      // Step 3: profiles for participants (can be empty for fresh mocks)
      const userIds = [...new Set(allParticipants.map((p) => p.user_id))];
      const profilesRes: { data: { user_id: string; display_name: string | null; avatar_url: string | null }[] | null; error: any } =
        userIds.length
          ? await withTimeout(
              "profiles",
              supabase
                .from("profiles")
                .select("user_id, display_name, avatar_url")
                .in("user_id", userIds)
            )
          : { data: [], error: null };

      if (profilesRes.error) throw profilesRes.error;
      const profiles = profilesRes.data || [];

      // Step 4: fetch last message per conversation (correctness > single global limit)
      const lastMessageByConversationId: Record<string, ChatMessage | undefined> = {};
      const lastMessageRows = await withTimeout(
        "last_messages",
        mapWithConcurrency(conversationIds, 6, async (conversationId) => {
          const { data, error } = await supabase
            .from("messages")
            .select("*")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(1);
          if (error) throw error;
          return { conversationId, message: (data && data[0]) as ChatMessage | undefined };
        }),
        20000
      );

      for (const row of lastMessageRows) {
        if (row.message) lastMessageByConversationId[row.conversationId] = row.message;
      }

      // Step 5: exact unread counts without a hard limit
      const unreadCountByConversationId: Record<string, number> = {};
      const unreadCounts = await withTimeout(
        "unread_counts",
        mapWithConcurrency(conversationIds, 6, async (conversationId) => {
          const { count, error } = await supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", conversationId)
            .neq("sender_id", user.id)
            .eq("is_read", false);
          if (error) throw error;
          return { conversationId, count: count || 0 };
        }),
        20000
      );

      for (const row of unreadCounts) {
        unreadCountByConversationId[row.conversationId] = row.count;
      }

      // Build conversation objects
      const convs: Conversation[] = (convData || []).map((conv) => {
        const participants = (allParticipants || [])
          .filter((p) => p.conversation_id === conv.id)
          .map((p) => ({
            user_id: p.user_id,
            profile: profiles?.find((pr) => pr.user_id === p.user_id),
          }));

        const lastMessage = lastMessageByConversationId[conv.id];

        return {
          id: conv.id,
          created_at: conv.created_at,
          updated_at: conv.updated_at,
          participants,
          last_message: lastMessage,
          unread_count: unreadCountByConversationId[conv.id] || 0,
        };
      });

      setConversations(convs);
      console.log("[useConversations] done", { count: convs.length });
    } catch (error) {
      console.error("Error fetching conversations:", error);
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
  }, [user, mapWithConcurrency]);


  useEffect(() => {
    fetchConversations();
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
              fetchConversations();
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
              fetchConversations();
            }
          )
          .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchConversations]);

  return { conversations, loading, error, refetch: fetchConversations };
}

export function useMessages(conversationId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const recoveryPolicy = getChatV11RecoveryPolicyConfig();
  const pollInFlightRef = useRef(false);
  const pendingLocalByClientIdRef = useRef<Map<string, ChatMessage>>(new Map());
  const recentSendRef = useRef<Map<string, number>>(new Map());
  const inFlightFingerprintRef = useRef<Set<string>>(new Set());
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
        .order("created_at", { ascending: true });

      if (error) throw error;

      const serverMessages = sortMessages((data || []) as ChatMessage[]);
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
      console.error("Error fetching messages:", error);
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
          content: String(m?.content ?? ""),
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
  }, []);

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

    const intervalMs = 3000;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      Promise.resolve(fetchMessages()).finally(() => {
        pollInFlightRef.current = false;
      });
    }, intervalMs);

    return () => {
      window.clearInterval(id);
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
            if (newMessage?.client_msg_id) {
              pendingLocalByClientIdRef.current.delete(newMessage.client_msg_id);
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
  }, [conversationId, fetchMessages, sortMessages]);

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

  const sendMessage = async (content: string, opts?: { clientMsgId?: string }) => {
    console.log("[sendMessage] called with:", { conversationId, userId: user?.id, content });

    const normalizedContent = normalizeBrokenVerticalText(content).trim();

    if (!conversationId || !user || !normalizedContent) {
      console.log("[sendMessage] validation failed:", { conversationId, hasUser: !!user, trimmedContent: normalizedContent });
      return;
    }

    let clientMsgId: string | null = null;
    let fingerprint: string | null = null;
    let v11ClientWriteSeq: number | null = null;

    try {
      const normalizedFingerprint = `${conversationId}:${user.id}:${normalizedContent}`;
      fingerprint = normalizedFingerprint;

      if (inFlightFingerprintRef.current.has(normalizedFingerprint)) {
        console.log("[sendMessage] in-flight duplicate blocked");
        return;
      }
      inFlightFingerprintRef.current.add(normalizedFingerprint);

      const now = Date.now();
      const lastAt = recentSendRef.current.get(normalizedFingerprint);
      if (typeof lastAt === "number" && now - lastAt < 8_000) {
        console.log("[sendMessage] recent duplicate blocked");
        return;
      }

      clientMsgId = opts?.clientMsgId || crypto.randomUUID();
      console.log("[sendMessage] upserting message...", { clientMsgId });

      const hashtagVerdict = await checkHashtagsAllowedForText(normalizedContent);
      if (!hashtagVerdict.ok) {
        throw new Error(`HASHTAG_BLOCKED:${hashtagVerdict.blockedTags.join(", ")}`);
      }

      // Prevent accidental double-send: if the same content is already pending for this conversation, ignore.
      // Mark as sent immediately to block rapid re-sends even if the optimistic gets reconciled quickly.
      recentSendRef.current.set(normalizedFingerprint, now);

      // Keep the map bounded.
      if (recentSendRef.current.size > 200) {
        const min = now - 60_000;
        for (const [k, ts] of recentSendRef.current.entries()) {
          if (ts < min) recentSendRef.current.delete(k);
        }
      }

      const now2 = Date.now();
      for (const pending of pendingLocalByClientIdRef.current.values()) {
        if (pending.conversation_id !== conversationId) continue;
        if (pending.sender_id !== user.id) continue;
        if ((pending.content || "").trim() !== normalizedContent) continue;
        const t = Date.parse(pending.created_at);
        if (!Number.isNaN(t) && now2 - t < 1500) {
          console.log("[sendMessage] duplicate pending send blocked");
          return;
        }
      }

      // Optimistic add: makes message appear instantly (no 3s polling delay).
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
          clientMsgId: clientMsgId!,
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
        if (ackErr) throw ackErr;

        const ack = (Array.isArray(ackRows) ? ackRows[0] : null) as any;
        const ackStatus = String(ack?.ack_status || "");
        if (ackStatus !== "accepted" && ackStatus !== "duplicate") {
          clearPendingReceiptWatch(clientWriteSeq);
          throw new Error(String(ack?.error_code || "ERR_WRITE_REJECTED"));
        }

        const ackMsgId = ack?.msg_id ? String(ack.msg_id) : null;
        if (ackMsgId) {
          const { data: msgRow, error: msgErr } = await supabase.from("messages").select("*").eq("id", ackMsgId).maybeSingle();
          if (!msgErr && msgRow) {
            const returned = msgRow as unknown as ChatMessage;
            pendingLocalByClientIdRef.current.delete(clientMsgId);
            clearPendingReceiptWatch(clientWriteSeq);
            setMessages((prev) => {
              const withoutLocal = prev.filter((m) => !(m.id.startsWith("local:") && m.client_msg_id === clientMsgId));
              if (withoutLocal.some((m) => m.id === returned.id)) return withoutLocal;
              return sortMessages([...withoutLocal, returned]);
            });
            return;
          }
        }
        return;
      }

      const { data, error } = await supabase
        .from("messages")
        .upsert(
          {
            conversation_id: conversationId,
            sender_id: user.id,
            content: normalizedContent,
            client_msg_id: clientMsgId,
          },
          {
            onConflict: "conversation_id,sender_id,client_msg_id",
            ignoreDuplicates: true,
          }
        )
        .select();

      if (error) {
        // If migrations weren't applied yet, fall back to a plain insert so chat isn't bricked.
        if (isIdempotencySchemaMissing(error)) {
          console.warn("[sendMessage] idempotency schema missing; falling back to insert", error);

          // Best-effort server-side dedupe (no unique constraint available).
          // If an identical message was already inserted very recently, skip creating a duplicate row.
          try {
            const { data: recentRows, error: recentErr } = await supabase
              .from("messages")
              .select("id,created_at,content,sender_id")
              .eq("conversation_id", conversationId)
              .eq("sender_id", user.id)
              .order("created_at", { ascending: false })
              .limit(5);

            if (!recentErr && Array.isArray(recentRows) && recentRows.length > 0) {
              const nowMs = Date.now();
              const hasDuplicate = recentRows.some((r: any) => {
                if ((r?.content || "").trim() !== normalizedContent) return false;
                const t = Date.parse(String(r?.created_at || ""));
                if (Number.isNaN(t)) return false;
                return nowMs - t < 10_000;
              });

              if (hasDuplicate) {
                pendingLocalByClientIdRef.current.delete(clientMsgId);
                void fetchMessages();
                return;
              }
            }
          } catch {
            // ignore; proceed to insert
          }

          const { error: fallbackError } = await supabase.from("messages").insert({
            conversation_id: conversationId,
            sender_id: user.id,
            content: normalizedContent,
          });
          if (fallbackError) throw fallbackError;

          // We can't reliably reconcile without client_msg_id on the server row.
          pendingLocalByClientIdRef.current.delete(clientMsgId);
          void fetchMessages();
          return;
        }

        console.error("[sendMessage] upsert error:", error);
        throw error;
      }

      const returned = (Array.isArray(data) ? (data[0] as ChatMessage | undefined) : undefined) ?? undefined;
      if (returned?.id) {
        pendingLocalByClientIdRef.current.delete(clientMsgId);
        setMessages((prev) => {
          const withoutLocal = prev.filter((m) => !(m.id.startsWith("local:") && m.client_msg_id === clientMsgId));
          if (withoutLocal.some((m) => m.id === returned.id)) return withoutLocal;
          return sortMessages([...withoutLocal, returned]);
        });
      }

      console.log("[sendMessage] success:", data);
    } catch (error) {
      console.error("[sendMessage] error:", error);

      // Roll back optimistic message on failure.
      if (clientMsgId) {
        pendingLocalByClientIdRef.current.delete(clientMsgId);
        setMessages((prev) => prev.filter((m) => !(m.id.startsWith("local:") && m.client_msg_id === clientMsgId)));
      }
      if (v11ClientWriteSeq != null) {
        clearPendingReceiptWatch(v11ClientWriteSeq);
      }
      throw error; // Re-throw to let caller handle
    } finally {
      if (fingerprint) {
        inFlightFingerprintRef.current.delete(fingerprint);
      }
    }
  };

  const sendMediaMessage = async (file: File, mediaType: 'voice' | 'video_circle' | 'image' | 'video', durationSeconds?: number) => {
    if (!conversationId || !user) return { error: 'Not authenticated' };

    try {
      // Upload to storage
      const fileExt = file.name.split('.').pop() || 'webm';
      const fileName = `${user.id}/${conversationId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('chat-media')
        .getPublicUrl(fileName);

      // Insert message with media (idempotent retries via client_msg_id)
      const clientMsgId = crypto.randomUUID();
      const payload = {
        conversation_id: conversationId,
        sender_id: user.id,
        content:
          mediaType === 'voice'
            ? '🎤 Голосовое сообщение'
            : mediaType === 'video_circle'
              ? '🎬 Видео-кружок'
              : mediaType === 'video'
                ? '🎥 Видео'
                : '📷 Изображение',
        media_url: publicUrl,
        media_type: mediaType,
        duration_seconds: durationSeconds || null,
        client_msg_id: clientMsgId,
      };

      const { error: msgError } = await supabase
        .from("messages")
        .upsert(payload, {
          onConflict: "conversation_id,sender_id,client_msg_id",
          ignoreDuplicates: true,
        });

      if (msgError) {
        if (isIdempotencySchemaMissing(msgError)) {
          console.warn("[sendMediaMessage] idempotency schema missing; falling back to insert", msgError);
          const { error: fallbackError } = await supabase.from("messages").insert({
            conversation_id: conversationId,
            sender_id: user.id,
            content: payload.content,
            media_url: publicUrl,
            media_type: mediaType,
            duration_seconds: durationSeconds || null,
          });
          if (fallbackError) throw fallbackError;
        } else {
          throw msgError;
        }
      }

      return { error: null };
    } catch (error) {
      console.error("Error sending media message:", error);
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
      console.error("Error deleting message:", error);
      return { error: error instanceof Error ? error.message : 'Failed to delete message' };
    }
  };

  return { messages, loading, sendMessage, sendMediaMessage, deleteMessage, refetch: fetchMessages };
}

export function useCreateConversation() {
  const { user } = useAuth();

  const createConversation = async (otherUserId: string) => {
    if (!user) return null;

    try {
      // Best-effort: reuse an existing DM between these two users.
      const [myParts, otherParts] = await Promise.all([
        supabase.from("conversation_participants").select("conversation_id").eq("user_id", user.id),
        supabase.from("conversation_participants").select("conversation_id").eq("user_id", otherUserId),
      ]);

      if (myParts.error) throw myParts.error;
      if (otherParts.error) throw otherParts.error;

      const myIds = new Set((myParts.data || []).map((r: any) => r.conversation_id));
      const candidateIds = (otherParts.data || [])
        .map((r: any) => r.conversation_id)
        .filter((id: any) => myIds.has(id));

      if (candidateIds.length) {
        const { data: allParts, error: allPartsError } = await supabase
          .from("conversation_participants")
          .select("conversation_id, user_id")
          .in("conversation_id", candidateIds);
        if (allPartsError) throw allPartsError;

        const counts: Record<string, number> = {};
        const hasMe: Record<string, boolean> = {};
        const hasOther: Record<string, boolean> = {};
        for (const row of allParts || []) {
          counts[row.conversation_id] = (counts[row.conversation_id] || 0) + 1;
          if (row.user_id === user.id) hasMe[row.conversation_id] = true;
          if (row.user_id === otherUserId) hasOther[row.conversation_id] = true;
        }

        const dmIds = candidateIds.filter((id) => counts[id] === 2 && hasMe[id] && hasOther[id]);
        if (dmIds.length) {
          const { data: convRow, error: convErr } = await supabase
            .from("conversations")
            .select("id")
            .in("id", dmIds)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (convErr) throw convErr;
          if (convRow?.id) return convRow.id;
          return dmIds[0];
        }
      }

      // Create conversation
      const { data: conv, error: convError } = await supabase
        .from("conversations")
        .insert({})
        .select()
        .single();

      if (convError) throw convError;

      // Add both participants
      const { error: partError } = await supabase.from("conversation_participants").insert([
        { conversation_id: conv.id, user_id: user.id },
        { conversation_id: conv.id, user_id: otherUserId },
      ]);

      if (partError) {
        // Compensating cleanup to avoid orphan conversations without participants.
        try {
          await supabase.from("conversation_participants").delete().eq("conversation_id", conv.id);
        } catch {
          // ignore
        }
        try {
          await supabase.from("conversations").delete().eq("id", conv.id);
        } catch {
          // ignore
        }
        throw partError;
      }

      return conv.id;
    } catch (error) {
      console.error("Error creating conversation:", error);
      return null;
    }
  };

  return { createConversation };
}
