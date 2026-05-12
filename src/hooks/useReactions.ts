/**
 * @file src/hooks/useReactions.ts
 * @description Хук для управления emoji-реакциями на Reel.
 * Поддерживает toggle-реакции, batch-загрузку реакций, и optimistic updates.
 */

import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { logger } from '@/lib/logger';
import { OperationMutex } from '@/lib/errors';
import type { ReelReaction, ReactionsMap, ReactionCount } from '@/types/reels/premium';

const PAGE_SIZE = 20;

/**
 * Хук для загрузки и управления реакциями на Reel.
 */
export function useReactions() {
  const { user } = useAuth();
  const [reactionsMap, setReactionsMap] = useState<Record<string, ReactionsMap>>({});
  const [reactionCounts, setReactionCounts] = useState<Record<string, ReactionCount[]>>({});
  const [loading, setLoading] = useState(false);
  const mutex = useRef(new OperationMutex());

  /**
   * Загрузить реакции для списка Reel.
   */
  const fetchReactions = useCallback(async (reelIds: string[]) => {
    if (reelIds.length === 0) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('reel_reactions')
        .select('reel_id, emoji, user_id')
        .in('reel_id', reelIds);

      if (error) {
        logger.warn('[useReactions] Fetch failed', { error });
        return;
      }

      // Group by reel_id → emoji → count
      const newMap: Record<string, ReactionsMap> = {};
      const newCounts: Record<string, ReactionCount[]> = {};

      for (const reelId of reelIds) {
        newMap[reelId] = {};
        newCounts[reelId] = [];
      }

      const rows = data as Array<{ reel_id: string; emoji: string; user_id: string }>;

      for (const row of rows) {
        if (!newMap[row.reel_id]) {
          newMap[row.reel_id] = {};
          newCounts[row.reel_id] = [];
        }
        if (!newMap[row.reel_id][row.emoji]) {
          newMap[row.reel_id][row.emoji] = 0;
        }
        newMap[row.reel_id][row.emoji]! += 1;
      }

      // Build reaction counts with user's own reaction status
      for (const reelId of reelIds) {
        const counts: ReactionCount[] = [];
        const userReelReactions = data
          ? (data as Array<{ reel_id: string; emoji: string; user_id: string }>)
              .filter((r) => r.reel_id === reelId)
          : [];

        const emojiCounts: Record<string, { count: number; hasReacted: boolean }> = {};
        for (const row of userReelReactions) {
          if (!emojiCounts[row.emoji]) {
            emojiCounts[row.emoji] = { count: 0, hasReacted: false };
          }
          emojiCounts[row.emoji].count += 1;
          if (row.user_id === user?.id) {
            emojiCounts[row.emoji].hasReacted = true;
          }
        }

        for (const [emoji, info] of Object.entries(emojiCounts)) {
          counts.push({ emoji, count: info.count, has_reacted: info.hasReacted });
        }

        counts.sort((a, b) => b.count - a.count);
        newCounts[reelId] = counts;
      }

      setReactionsMap((prev) => ({ ...prev, ...newMap }));
      setReactionCounts((prev) => ({ ...prev, ...newCounts }));
    } catch (err) {
      logger.error('[useReactions] Error fetching reactions', { error: err });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  /**
   * Переключить реакцию на Reel (toggle: поставить/убрать конкретное эмодзи).
   */
  const toggleReaction = useCallback(
    async (reelId: string, emoji: string) => {
      if (!user) return;

      await mutex.current.execute(async () => {
        const currentUserReactions = reactionsMap[reelId] ?? {};
        const hasReacted = currentUserReactions[emoji] != null && currentUserReactions[emoji]! > 0;

        // Optimistic update
        setReactionsMap((prev) => {
          const next = { ...prev };
          if (!next[reelId]) next[reelId] = {};
          if (hasReacted) {
            const newCount = Math.max(0, (next[reelId][emoji] ?? 0) - 1);
            if (newCount === 0) {
              delete next[reelId][emoji];
            } else {
              next[reelId][emoji] = newCount;
            }
          } else {
            next[reelId][emoji] = (next[reelId][emoji] ?? 0) + 1;
          }
          return next;
        });

        try {
          await supabase.rpc('record_reel_reaction', {
            p_reel_id: reelId,
            p_emoji: emoji,
          });
        } catch (error) {
          // Rollback optimistic update
          setReactionsMap((prev) => {
            const next = { ...prev };
            if (!next[reelId]) next[reelId] = {};
            if (hasReacted) {
              next[reelId][emoji] = (next[reelId][emoji] ?? 0) + 1;
            } else {
              const newCount = Math.max(0, (next[reelId][emoji] ?? 0) - 1);
              if (newCount === 0) {
                delete next[reelId][emoji];
              } else {
                next[reelId][emoji] = newCount;
              }
            }
            return next;
          });
          logger.error('[useReactions] Error toggling reaction', { error, reelId, emoji });
        }
      });
    },
    [user, reactionsMap, mutex],
  );

  /**
   * Добавить быструю реакцию (для UI: animated emoji popup).
   */
  const addReaction = useCallback(
    async (reelId: string, emoji: string) => {
      await toggleReaction(reelId, emoji);
    },
    [toggleReaction],
  );

  /**
   * Получить текущие реакции пользователя на Reel.
   */
  const getMyReactions = useCallback(
    (reelId: string): string[] => {
      const reactions = reactionsMap[reelId] ?? {};
      return Object.entries(reactions)
        .filter(([, count]) => count && count > 0)
        .map(([emoji]) => emoji);
    },
    [reactionsMap],
  );

  /**
   * Получить агрегированный список реакций для Reel.
   */
  const getReactionCounts = useCallback(
    (reelId: string): ReactionCount[] => {
      return reactionCounts[reelId] ?? [];
    },
    [reactionCounts],
  );

  return {
    reactionsMap,
    reactionCounts,
    loading,
    fetchReactions,
    toggleReaction,
    addReaction,
    getMyReactions,
    getReactionCounts,
  };
}

export default useReactions;