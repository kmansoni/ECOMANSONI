/**
 * useTrialReels — A/B тестирование Reels на ограниченной аудитории.
 *
 * - startTrial: начать показ ограниченной аудитории
 * - endTrial: завершить и опубликовать/скрыть
 * - getTrialStats: статистика trial
 * - myTrials: мои пробные Reels
 * - loading: состояние
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { dbLoose } from "@/lib/supabase";

export interface TrialStats {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  avgWatchTime: number;
  completionRate: number;
}

export interface TrialReel {
  id: string;
  content: string | null;
  is_trial: boolean;
  trial_audience_percent: number;
  trial_started_at: string | null;
  trial_ended_at: string | null;
  trial_stats: TrialStats;
  created_at: string;
  thumbnail_url?: string;
}

const EMPTY_STATS: TrialStats = {
  views: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  avgWatchTime: 0,
  completionRate: 0,
};

export function useTrialReels() {
  const { user } = useAuth();
  const [myTrials, setMyTrials] = useState<TrialReel[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTrials = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { data, error } = await dbLoose
        .from('posts')
        .select('id, content, is_trial, trial_audience_percent, trial_started_at, trial_ended_at, trial_stats, created_at')
        .eq('author_id', user.id)
        .eq('is_trial', true)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        logger.error('[useTrialReels] Ошибка загрузки trial reels', { error });
        return;
      }

      setMyTrials(
        (data ?? []).map((r: Record<string, unknown>) => ({
          ...r,
          trial_stats: (r.trial_stats as TrialStats) ?? EMPTY_STATS,
        })) as TrialReel[]
      );
    } catch (err) {
      logger.error('[useTrialReels] Непредвиденная ошибка', { error: err });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadTrials();
  }, [loadTrials]);

  const startTrial = useCallback(async (postId: string, audiencePercent: number) => {
    if (!user) {
      toast.error('Необходима авторизация');
      return;
    }

    const clamped = Math.max(1, Math.min(50, audiencePercent));

    try {
      setLoading(true);
      const { error } = await dbLoose
        .from('posts')
        .update({
          is_trial: true,
          trial_audience_percent: clamped,
          trial_started_at: new Date().toISOString(),
          trial_ended_at: null,
          trial_stats: EMPTY_STATS,
        })
        .eq('id', postId)
        .eq('author_id', user.id);

      if (error) {
        logger.error('[useTrialReels] Ошибка запуска trial', { postId, error });
        toast.error('Не удалось запустить trial');
        return;
      }

      toast.success(`Trial запущен: ${clamped}% аудитории`);
      await loadTrials();
    } catch (err) {
      logger.error('[useTrialReels] Ошибка запуска trial', { error: err });
      toast.error('Ошибка при запуске trial');
    } finally {
      setLoading(false);
    }
  }, [user, loadTrials]);

  const endTrial = useCallback(async (postId: string, makePublic: boolean) => {
    if (!user) return;

    try {
      setLoading(true);
      const { error } = await dbLoose
        .from('posts')
        .update({
          is_trial: false,
          trial_ended_at: new Date().toISOString(),
          is_published: makePublic,
        })
        .eq('id', postId)
        .eq('author_id', user.id);

      if (error) {
        logger.error('[useTrialReels] Ошибка завершения trial', { postId, error });
        toast.error('Не удалось завершить trial');
        return;
      }

      toast.success(makePublic ? 'Опубликовано для всех' : 'Trial завершён');
      await loadTrials();
    } catch (err) {
      logger.error('[useTrialReels] Ошибка завершения trial', { error: err });
      toast.error('Ошибка при завершении trial');
    } finally {
      setLoading(false);
    }
  }, [user, loadTrials]);

  const getTrialStats = useCallback(async (postId: string): Promise<TrialStats> => {
    try {
      const { data, error } = await dbLoose
        .from('posts')
        .select('trial_stats, views_count, likes_count, comments_count, shares_count')
        .eq('id', postId)
        .single();

      if (error || !data) {
        logger.error('[useTrialReels] Ошибка загрузки статистики', { postId, error });
        return EMPTY_STATS;
      }

      const stored = data.trial_stats as TrialStats | null;
      return {
        views: stored?.views ?? data.views_count ?? 0,
        likes: stored?.likes ?? data.likes_count ?? 0,
        comments: stored?.comments ?? data.comments_count ?? 0,
        shares: stored?.shares ?? data.shares_count ?? 0,
        avgWatchTime: stored?.avgWatchTime ?? 0,
        completionRate: stored?.completionRate ?? 0,
      };
    } catch (err) {
      logger.error('[useTrialReels] Ошибка загрузки статистики', { error: err });
      return EMPTY_STATS;
    }
  }, []);

  return { startTrial, endTrial, getTrialStats, myTrials, loading } as const;
}
