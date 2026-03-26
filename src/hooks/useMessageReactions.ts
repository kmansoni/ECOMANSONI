import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { logger } from "@/lib/logger";
import type { RealtimeChannel } from "@supabase/supabase-js";

type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;

interface MessageIdRow {
  id: string;
}

interface MessageReactionRow {
  message_id: string;
  user_id: string;
  emoji: string;
}

type MessageReactionUpsertRow = MessageReactionRow & {
  conversation_id?: string;
};

interface ErrorLike {
  code?: string;
  message?: string;
  details?: string;
  status?: number;
}

interface MessageReactionsClient {
  from(table: "messages"): {
    select: (columns: "id") => {
      eq: (column: "conversation_id", value: string) => QueryResult<MessageIdRow[]>;
    };
  };
  from(table: "message_reactions"): {
    select: (columns: "message_id, user_id, emoji") => {
      eq: (column: "conversation_id", value: string) => QueryResult<MessageReactionRow[]>;
      in: (column: "message_id", values: string[]) => QueryResult<MessageReactionRow[]>;
    };
    upsert: (payload: MessageReactionUpsertRow, options: { onConflict: string }) => QueryResult<null>;
    delete: () => {
      eq: (column: "message_id", value: string) => {
        eq: (column: "user_id", value: string) => {
          eq: (column: "emoji", value: string) => QueryResult<null>;
        };
      };
    };
  };
  channel: typeof supabase.channel;
  removeChannel: typeof supabase.removeChannel;
}

const db = supabase as unknown as MessageReactionsClient;

export interface MessageReaction {
  emoji: string;
  count: number;
  hasReacted: boolean;
  userIds: string[];
}

/** messageId → MessageReaction[] */
export type ReactionsMap = Map<string, MessageReaction[]>;

const LS_KEY_PREFIX = "msg_reactions_v1_";
const LS_CONV_FILTER_CAP_KEY = "msg_reactions_conv_filter_cap_v1";
const loggedLsErrors = new Set<string>();

function readConversationFilterCapability(): boolean {
  try {
    const raw = localStorage.getItem(LS_CONV_FILTER_CAP_KEY);
    if (raw === "0") return false;
    if (raw === "1") return true;
    return true;
  } catch {
    return true;
  }
}

function writeConversationFilterCapability(enabled: boolean): void {
  try {
    localStorage.setItem(LS_CONV_FILTER_CAP_KEY, enabled ? "1" : "0");
  } catch {
    // ignore storage failures
  }
}

function logOnce(key: string, message: string, context?: unknown): void {
  if (loggedLsErrors.has(key)) return;
  loggedLsErrors.add(key);
  logger.warn(message, context);
}

function toErrorLike(error: unknown): ErrorLike {
  if (!error || typeof error !== "object") return {};
  return error as ErrorLike;
}

function mergeReactionRows(
  rows: MessageReactionRow[],
  currentUserId: string | undefined
): ReactionsMap {
  const map = new Map<string, Map<string, { count: number; userIds: string[] }>>();

  for (const row of rows) {
    if (!map.has(row.message_id)) map.set(row.message_id, new Map());
    const emojiMap = map.get(row.message_id)!;
    if (!emojiMap.has(row.emoji)) emojiMap.set(row.emoji, { count: 0, userIds: [] });
    const entry = emojiMap.get(row.emoji)!;
    entry.count++;
    entry.userIds.push(row.user_id);
  }

  const result: ReactionsMap = new Map();
  for (const [msgId, emojiMap] of map.entries()) {
    const reactions: MessageReaction[] = [];
    for (const [emoji, data] of emojiMap.entries()) {
      reactions.push({
        emoji,
        count: data.count,
        hasReacted: !!currentUserId && data.userIds.includes(currentUserId),
        userIds: data.userIds,
      });
    }
    result.set(msgId, reactions);
  }
  return result;
}

/**
 * Hook for managing message reactions across all messages in a conversation.
 * Supabase primary + localStorage fallback + Realtime subscriptions.
 */
export function useMessageReactions(conversationId: string) {
  const { user } = useAuth();
  const [reactionsMap, setReactionsMap] = useState<ReactionsMap>(new Map());
  const [canFilterByConversation, setCanFilterByConversation] = useState<boolean>(() => readConversationFilterCapability());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const tableUnavailableRef = useRef(false);
  const reactionsMapRef = useRef<ReactionsMap>(new Map());
  const mutationVersionRef = useRef(0);
  const mutationQueueRef = useRef<Map<string, Promise<void>>>(new Map());
  const fetchRequestIdRef = useRef(0);
  const lsKey = `${LS_KEY_PREFIX}${conversationId}`;

  const isMissingConversationIdError = useCallback((err: unknown) => {
    const e = toErrorLike(err);
    const msg = String(e?.message ?? "");
    return e?.code === "42703" || msg.includes("message_reactions.conversation_id") || msg.includes("conversation_id does not exist");
  }, []);

  const isMissingReactionsTableError = useCallback((err: unknown) => {
    const e = toErrorLike(err);
    const msg = String(e?.message ?? "").toLowerCase();
    const details = String(e?.details ?? "").toLowerCase();
    const code = String(e?.code ?? "");
    const status = Number(e?.status ?? 0);
    return (
      code === "42P01" ||
      code === "PGRST205" ||
      code === "PGRST204" ||
      msg.includes("message_reactions") && (msg.includes("does not exist") || msg.includes("could not find the table") || msg.includes("schema cache")) ||
      details.includes("message_reactions") && details.includes("schema cache") ||
      status === 404
    );
  }, []);

  // ── localStorage helpers ─────────────────────────────────────────────────

  const persistToLS = useCallback(
    (rows: MessageReactionRow[]) => {
      try {
        localStorage.setItem(lsKey, JSON.stringify(rows));
      } catch (error) {
        logOnce(`persist:${lsKey}`, "message_reactions.persist_to_ls_failed", { error, lsKey });
      }
    },
    [lsKey]
  );

  const loadFromLS = useCallback((): MessageReactionRow[] => {
    try {
      const raw = localStorage.getItem(lsKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch (error) {
      logOnce(`load:${lsKey}`, "message_reactions.load_from_ls_failed", { error, lsKey });
      return [];
    }
  }, [lsKey]);

  const commitReactionsMap = useCallback((updater: (prev: ReactionsMap) => ReactionsMap) => {
    const next = updater(reactionsMapRef.current);
    reactionsMapRef.current = next;
    setReactionsMap(next);
    return next;
  }, []);

  const replaceReactionsMap = useCallback((next: ReactionsMap) => {
    reactionsMapRef.current = next;
    setReactionsMap(next);
  }, []);

  const canApplyFetchResult = useCallback((requestId: number, mutationVersionAtStart: number) => {
    return requestId === fetchRequestIdRef.current && mutationVersionAtStart === mutationVersionRef.current;
  }, []);

  const fetchByMessageIds = useCallback(async (requestId: number, mutationVersionAtStart: number) => {
    const { data: msgRows, error: msgErr } = await db
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId);
    if (msgErr) throw msgErr;

    const ids = ((msgRows ?? []) as MessageIdRow[]).map((row) => String(row.id)).filter(Boolean);
    if (ids.length === 0) {
      if (!canApplyFetchResult(requestId, mutationVersionAtStart)) return;
      replaceReactionsMap(new Map());
      persistToLS([]);
      return;
    }

    const { data, error } = await db
      .from("message_reactions")
      .select("message_id, user_id, emoji")
      .in("message_id", ids);

    if (error) throw error;

    const rows = (data ?? []) as MessageReactionRow[];
    if (!canApplyFetchResult(requestId, mutationVersionAtStart)) return;
    persistToLS(rows);
    replaceReactionsMap(mergeReactionRows(rows, user?.id));
  }, [canApplyFetchResult, conversationId, persistToLS, replaceReactionsMap, user?.id]);

  // ── Fetch all reactions for the conversation ─────────────────────────────

  const fetchReactions = useCallback(async () => {
    if (tableUnavailableRef.current) {
      const rows = loadFromLS();
      replaceReactionsMap(mergeReactionRows(rows, user?.id));
      return;
    }
    const requestId = ++fetchRequestIdRef.current;
    const mutationVersionAtStart = mutationVersionRef.current;

    try {
      if (canFilterByConversation) {
        const { data, error } = await db
          .from("message_reactions")
          .select("message_id, user_id, emoji")
          .eq("conversation_id", conversationId);

        if (error) {
          if (isMissingConversationIdError(error)) {
            writeConversationFilterCapability(false);
            setCanFilterByConversation(false);
            await fetchByMessageIds(requestId, mutationVersionAtStart);
            return;
          }
          throw error;
        }

      const rows = (data ?? []) as MessageReactionRow[];
        if (!canApplyFetchResult(requestId, mutationVersionAtStart)) return;
        persistToLS(rows);
        replaceReactionsMap(mergeReactionRows(rows, user?.id));
        return;
      }

      await fetchByMessageIds(requestId, mutationVersionAtStart);
    } catch (err) {
      if (isMissingReactionsTableError(err)) {
        tableUnavailableRef.current = true;
      }
      logger.warn("message_reactions.fetch_fallback_ls", { error: err, conversationId });
      const rows = loadFromLS();
      if (!canApplyFetchResult(requestId, mutationVersionAtStart)) return;
      replaceReactionsMap(mergeReactionRows(rows, user?.id));
    }
  }, [canApplyFetchResult, canFilterByConversation, conversationId, user?.id, persistToLS, loadFromLS, isMissingConversationIdError, isMissingReactionsTableError, fetchByMessageIds, replaceReactionsMap]);

  const enqueueMessageMutation = useCallback(async (messageId: string, operation: () => Promise<void>) => {
    const queues = mutationQueueRef.current;
    const previous = queues.get(messageId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);

    queues.set(messageId, next);

    try {
      await next;
    } finally {
      if (queues.get(messageId) === next) {
        queues.delete(messageId);
      }
    }
  }, []);

  // ── Realtime subscription ────────────────────────────────────────────────

  useEffect(() => {
    fetchReactions();

    if (!canFilterByConversation || tableUnavailableRef.current) {
      return () => {};
    }

    const channel = db
      .channel(`message_reactions:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          fetchReactions();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        db.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [conversationId, fetchReactions, canFilterByConversation]);

  // ── Mutation helpers ─────────────────────────────────────────────────────

  const addReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!user) return;
      mutationVersionRef.current += 1;

      // Optimistic update — PK is (message_id, user_id), so a user can only
      // have ONE emoji per message.  When switching emoji, we first remove
      // the old reaction count and then add the new one.
      commitReactionsMap((prev) => {
        const next = new Map(prev);
        let existing = next.get(messageId) ?? [];

        // Remove user's previous reaction (if any) regardless of emoji
        const previousReaction = existing.find((r) => r.hasReacted);
        if (previousReaction && previousReaction.emoji !== emoji) {
          existing = existing
            .map((r) =>
              r.emoji === previousReaction.emoji
                ? {
                    ...r,
                    count: Math.max(0, r.count - 1),
                    hasReacted: false,
                    userIds: r.userIds.filter((uid) => uid !== user.id),
                  }
                : r
            )
            .filter((r) => r.count > 0);
        }

        const found = existing.find((r) => r.emoji === emoji);
        if (found) {
          next.set(
            messageId,
            existing.map((r) =>
              r.emoji === emoji
                ? { ...r, count: r.count + 1, hasReacted: true, userIds: [...r.userIds, user.id] }
                : r
            )
          );
        } else {
          next.set(messageId, [
            ...existing,
            { emoji, count: 1, hasReacted: true, userIds: [user.id] },
          ]);
        }
        return next;
      });

      try {
        await enqueueMessageMutation(messageId, async () => {
          if (tableUnavailableRef.current) {
            return;
          }
          const payload: MessageReactionUpsertRow = {
            message_id: messageId,
            user_id: user.id,
            emoji,
          };
          if (canFilterByConversation) payload.conversation_id = conversationId;
          // Use upsert to handle PK(message_id, user_id) — allows changing emoji
          // without a separate delete. ON CONFLICT updates the emoji column.
          const { error } = await db
            .from("message_reactions")
            .upsert(payload, { onConflict: "message_id,user_id" });
          if (error) throw error;
        });
      } catch (err) {
        if (isMissingReactionsTableError(err)) {
          tableUnavailableRef.current = true;
          return;
        }
        if (isMissingConversationIdError(err)) {
          writeConversationFilterCapability(false);
          setCanFilterByConversation(false);
        }
        logger.error("message_reactions.add_failed", { error: err, conversationId, messageId, emoji });
        // Revert optimistic — refetch
        fetchReactions();
      }
    },
    [user, conversationId, fetchReactions, canFilterByConversation, isMissingConversationIdError, isMissingReactionsTableError, commitReactionsMap, enqueueMessageMutation]
  );

  const removeReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!user) return;
      mutationVersionRef.current += 1;

      // Optimistic update
      commitReactionsMap((prev) => {
        const next = new Map(prev);
        const existing = next.get(messageId) ?? [];
        next.set(
          messageId,
          existing
            .map((r) =>
              r.emoji === emoji
                ? {
                    ...r,
                    count: Math.max(0, r.count - 1),
                    hasReacted: false,
                    userIds: r.userIds.filter((id) => id !== user.id),
                  }
                : r
            )
            .filter((r) => r.count > 0)
        );
        return next;
      });

      try {
        await enqueueMessageMutation(messageId, async () => {
          if (tableUnavailableRef.current) {
            return;
          }
          const { error } = await db
            .from("message_reactions")
            .delete()
            .eq("message_id", messageId)
            .eq("user_id", user.id)
            .eq("emoji", emoji);
          if (error) throw error;
        });
      } catch (err) {
        if (isMissingReactionsTableError(err)) {
          tableUnavailableRef.current = true;
          return;
        }
        logger.error("message_reactions.remove_failed", { error: err, conversationId, messageId, emoji });
        fetchReactions();
      }
    },
    [user, fetchReactions, commitReactionsMap, isMissingReactionsTableError, enqueueMessageMutation]
  );

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const reactions = reactionsMapRef.current.get(messageId) ?? [];
      const existing = reactions.find((r) => r.emoji === emoji);
      if (existing?.hasReacted) {
        await removeReaction(messageId, emoji);
      } else {
        await addReaction(messageId, emoji);
      }
    },
    [addReaction, removeReaction]
  );

  const getReactions = useCallback(
    (messageId: string): MessageReaction[] => {
      return reactionsMap.get(messageId) ?? [];
    },
    [reactionsMap]
  );

  return {
    reactionsMap,
    addReaction,
    removeReaction,
    toggleReaction,
    getReactions,
  };
}
