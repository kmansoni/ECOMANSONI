import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
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
      } catch {
        // storage quota — ignore silently
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
    } catch {
      return [];
    }
  }, [lsKey]);

  const fetchByMessageIds = useCallback(async () => {
    const { data: msgRows, error: msgErr } = await db
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId);
    if (msgErr) throw msgErr;

    const ids = (msgRows ?? []).map((m: any) => String(m.id)).filter(Boolean);
    if (ids.length === 0) {
      setReactionsMap(new Map());
      persistToLS([]);
      return;
    }

    const { data, error } = await db
      .from("message_reactions")
      .select("message_id, user_id, emoji")
      .in("message_id", ids);

    if (error) throw error;

    const rows = (data ?? []) as { message_id: string; user_id: string; emoji: string }[];
    persistToLS(rows);
    setReactionsMap(mergeReactionRows(rows, user?.id));
  }, [conversationId, persistToLS, user?.id]);

  // ── Fetch all reactions for the conversation ─────────────────────────────

  const fetchReactions = useCallback(async () => {
    try {
      if (canFilterByConversation) {
        const { data, error } = await db
          .from("message_reactions")
          .select("message_id, user_id, emoji")
          .eq("conversation_id", conversationId);

        if (error) {
          if (isMissingConversationIdError(error)) {
            setCanFilterByConversation(false);
            await fetchByMessageIds();
            return;
          }
          throw error;
        }

        const rows = (data ?? []) as { message_id: string; user_id: string; emoji: string }[];
        persistToLS(rows);
        setReactionsMap(mergeReactionRows(rows, user?.id));
        return;
      }

      await fetchByMessageIds();
    } catch (err) {
      console.warn("[useMessageReactions] Supabase fetch failed, falling back to LS", err);
      const rows = loadFromLS();
      setReactionsMap(mergeReactionRows(rows, user?.id));
    }
  }, [canFilterByConversation, conversationId, user?.id, persistToLS, loadFromLS, isMissingConversationIdError, fetchByMessageIds]);

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

      // Optimistic update
      setReactionsMap((prev) => {
        const next = new Map(prev);
        const existing = next.get(messageId) ?? [];
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
        const { error } = await db.from("message_reactions").insert(payload);
        if (error) throw error;
      } catch (err) {
        if (isMissingConversationIdError(err)) {
          setCanFilterByConversation(false);
        }
        console.error("[useMessageReactions] addReaction error:", err);
        // Revert optimistic — refetch
        fetchReactions();
      }
    },
    [user, conversationId, fetchReactions, canFilterByConversation, isMissingConversationIdError]
  );

  const removeReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!user) return;

      // Optimistic update
      setReactionsMap((prev) => {
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
        console.error("[useMessageReactions] removeReaction error:", err);
        fetchReactions();
      }
    },
    [user, fetchReactions]
  );

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const reactions = reactionsMap.get(messageId) ?? [];
      const existing = reactions.find((r) => r.emoji === emoji);
      if (existing?.hasReacted) {
        await removeReaction(messageId, emoji);
      } else {
        await addReaction(messageId, emoji);
      }
    },
    [reactionsMap, addReaction, removeReaction]
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
