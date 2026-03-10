/**
 * useLiveReactions — Supabase Realtime Broadcast reactions.
 *
 * - Subscribes to channel `live:{sessionId}:reactions`.
 * - Throttles outgoing reactions to 1 per 2 seconds (per user).
 * - Auto-removes reactions from the ephemeral list after 3 s (for animation).
 * - Maintains a running count per reaction type for the lifetime of the hook.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { LiveReaction, ReactionType } from '@/types/livestream';

export interface UseLiveReactionsReturn {
  reactions: LiveReaction[];
  sendReaction: (type: ReactionType) => void;
  reactionCounts: Record<ReactionType, number>;
}

const THROTTLE_MS = 2_000;
const AUTO_REMOVE_MS = 3_000;
const EMPTY_COUNTS: Record<ReactionType, number> = {
  '❤️': 0,
  '🔥': 0,
  '👏': 0,
  '😂': 0,
  '😮': 0,
  '🎉': 0,
};

/**
 * Manages ephemeral emoji reactions for a live session.
 * Pass `null` to disable the subscription.
 */
export function useLiveReactions(sessionId: number | null): UseLiveReactionsReturn {
  const [reactions, setReactions] = useState<LiveReaction[]>([]);
  const [reactionCounts, setReactionCounts] = useState<Record<ReactionType, number>>(
    { ...EMPTY_COUNTS },
  );

  const lastSentRef = useRef<number>(0);
  const timerMapRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Subscription ──────────────────────────────────────────────────────────
  useEffect(() => {
    const timerMap = timerMapRef.current;

    if (sessionId == null) {
      setReactions([]);
      setReactionCounts({ ...EMPTY_COUNTS });
      return;
    }

    const channel = supabase
      .channel(`live:${sessionId}:reactions`)
      .on('broadcast', { event: 'reaction' }, ({ payload }: { payload: LiveReaction }) => {
        const reaction = payload;

        // Add to ephemeral list
        setReactions((prev) => [...prev, reaction]);

        // Increment running count
        setReactionCounts((prev) => ({
          ...prev,
          [reaction.type]: (prev[reaction.type] ?? 0) + 1,
        }));

        // Schedule auto-removal for animation cleanup
        const existing = timerMap.get(reaction.id);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          setReactions((prev) => prev.filter((r) => r.id !== reaction.id));
          timerMap.delete(reaction.id);
        }, AUTO_REMOVE_MS);
        timerMap.set(reaction.id, timer);
      })
      .subscribe();
    channelRef.current = channel;

    return () => {
      // Clear all pending removal timers
      timerMap.forEach((t) => clearTimeout(t));
      timerMap.clear();
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // ── Send reaction ─────────────────────────────────────────────────────────
  const sendReaction = useCallback(
    (type: ReactionType) => {
      if (sessionId == null) return;

      const now = Date.now();
      if (now - lastSentRef.current < THROTTLE_MS) return;
      lastSentRef.current = now;

      const reaction: LiveReaction = {
        id: crypto.randomUUID(),
        user_id: 'self', // server-side will resolve; Broadcast is ephemeral
        type,
        timestamp: now,
      };

      void channelRef.current?.send({
        type: 'broadcast',
        event: 'reaction',
        payload: reaction,
      });
    },
    [sessionId],
  );

  return { reactions, sendReaction, reactionCounts };
}
