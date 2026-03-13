import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { logger } from "@/lib/logger";
// TODO: Regenerate Supabase types with `supabase gen types` to include message_reactions table.
// Using type assertion as temporary measure until types are regenerated.
const db = supabase as any;
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface MessageReaction {
  emoji: string;
  count: number;
  hasReacted: boolean;
  userIds: string[];
}

/** messageId → MessageReaction[] */
export type ReactionsMap = Map<string, MessageReaction[]>;

const LS_KEY_PREFIX = "msg_reactions_v1_";
const loggedLsErrors = new Set<string>();

function logOnce(key: string, message: string, context?: unknown): void {
  if (loggedLsErrors.has(key)) return;
  loggedLsErrors.add(key);
  logger.warn(message, context);
}

function mergeReactionRows(
  rows: { message_id: string; user_id: string; emoji: string }[],
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
  const [canFilterByConversation, setCanFilterByConversation] = useState(true);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const reactionsMapRef = useRef<ReactionsMap>(new Map());
  const mutationVersionRef = useRef(0);
  const fetchRequestIdRef = useRef(0);
  const lsKey = `${LS_KEY_PREFIX}${conversationId}`;

  const isMissingConversationIdError = useCallback((err: any) => {
    const msg = String(err?.message ?? "");
    return err?.code === "42703" || msg.includes("message_reactions.conversation_id") || msg.includes("conversation_id does not exist");
  }, []);

  // ── localStorage helpers ─────────────────────────────────────────────────

  const persistToLS = useCallback(
    (rows: { message_id: string; user_id: string; emoji: string }[]) => {
      try {
        localStorage.setItem(lsKey, JSON.stringify(rows));
      } catch (error) {
        logOnce(`persist:${lsKey}`, "message_reactions.persist_to_ls_failed", { error, lsKey });
      }
    },
    [lsKey]
  );

  const loadFromLS = useCallback((): { message_id: string; user_id: string; emoji: string }[] => {
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

    const ids = (msgRows ?? []).map((m: any) => String(m.id)).filter(Boolean);
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

    const rows = (data ?? []) as { message_id: string; user_id: string; emoji: string }[];
    if (!canApplyFetchResult(requestId, mutationVersionAtStart)) return;
    persistToLS(rows);
    replaceReactionsMap(mergeReactionRows(rows, user?.id));
  }, [canApplyFetchResult, conversationId, persistToLS, replaceReactionsMap, user?.id]);

  // ── Fetch all reactions for the conversation ─────────────────────────────

  const fetchReactions = useCallback(async () => {
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
            setCanFilterByConversation(false);
            await fetchByMessageIds(requestId, mutationVersionAtStart);
            return;
          }
          throw error;
        }

        const rows = (data ?? []) as { message_id: string; user_id: string; emoji: string }[];
        if (!canApplyFetchResult(requestId, mutationVersionAtStart)) return;
        persistToLS(rows);
        replaceReactionsMap(mergeReactionRows(rows, user?.id));
        return;
      }

      await fetchByMessageIds(requestId, mutationVersionAtStart);
    } catch (err) {
      logger.warn("message_reactions.fetch_fallback_ls", { error: err, conversationId });
      const rows = loadFromLS();
      if (!canApplyFetchResult(requestId, mutationVersionAtStart)) return;
      replaceReactionsMap(mergeReactionRows(rows, user?.id));
    }
  }, [canApplyFetchResult, canFilterByConversation, conversationId, user?.id, persistToLS, loadFromLS, isMissingConversationIdError, fetchByMessageIds, replaceReactionsMap]);

  // ── Realtime subscription ────────────────────────────────────────────────

  useEffect(() => {
    fetchReactions();

    if (!canFilterByConversation) {
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
        const payload: any = {
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
      } catch (err) {
        if (isMissingConversationIdError(err)) {
          setCanFilterByConversation(false);
        }
        logger.error("message_reactions.add_failed", { error: err, conversationId, messageId, emoji });
        // Revert optimistic — refetch
        fetchReactions();
      }
    },
    [user, conversationId, fetchReactions, canFilterByConversation, isMissingConversationIdError, commitReactionsMap]
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
        const { error } = await db
          .from("message_reactions")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", user.id)
          .eq("emoji", emoji);
        if (error) throw error;
      } catch (err) {
        logger.error("message_reactions.remove_failed", { error: err, conversationId, messageId, emoji });
        fetchReactions();
      }
    },
    [user, fetchReactions, commitReactionsMap]
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
