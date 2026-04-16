/**
 * useAchievements — значки достижений пользователя.
 *
 * - badges: все значки с earned-статусом
 * - earnedCount: количество заработанных
 * - checkAndGrant: проверить и выдать новые значки
 * - loading: состояние загрузки
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { dbLoose } from "@/lib/supabase";

export interface Achievement {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon_emoji: string;
  category: string;
  earned_at: string | null;
}

interface BadgeCriteria {
  type: string;
  threshold: number;
}

export function useAchievements(userId: string) {
  const { user } = useAuth();
  const [badges, setBadges] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);

  const earnedCount = badges.filter((b) => b.earned_at !== null).length;

  const loadBadges = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data: allBadges, error: badgesErr } = await dbLoose
        .from('achievement_badges')
        .select('id, slug, name, description, icon_emoji, category')
        .order('created_at', { ascending: true })
        .limit(100);

      if (badgesErr) {
        logger.error('[useAchievements] Ошибка загрузки значков', { error: badgesErr });
        return;
      }

      const { data: userBadges, error: ubErr } = await dbLoose
        .from('user_badges')
        .select('badge_id, earned_at')
        .eq('user_id', userId)
        .limit(100);

      if (ubErr) {
        logger.error('[useAchievements] Ошибка загрузки выданных значков', { error: ubErr });
        return;
      }

      const earnedMap = new Map<string, string>();
      for (const ub of userBadges ?? []) {
        earnedMap.set(ub.badge_id, ub.earned_at);
      }

      const merged: Achievement[] = (allBadges ?? []).map(
        (b: { id: string; slug: string; name: string; description: string; icon_emoji: string; category: string }) => ({
          ...b,
          earned_at: earnedMap.get(b.id) ?? null,
        })
      );

      setBadges(merged);
    } catch (err) {
      logger.error('[useAchievements] Непредвиденная ошибка', { error: err });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadBadges();
  }, [loadBadges]);

  const checkAndGrant = useCallback(async () => {
    if (!user || user.id !== userId) return;

    try {
      // Загрузка метрик пользователя параллельно
      const [postsRes, reelsRes, followersRes, likesRes] = await Promise.all([
        dbLoose.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', userId).eq('is_published', true),
        dbLoose.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', userId).eq('type', 'reel'),
        dbLoose.from('followers').select('id', { count: 'exact', head: true }).eq('following_id', userId),
        dbLoose.from('posts').select('likes_count').eq('author_id', userId).eq('is_published', true).limit(1000),
      ]);

      const postsCount = postsRes.count ?? 0;
      const reelsCount = reelsRes.count ?? 0;
      const followersCount = followersRes.count ?? 0;
      const totalLikes = (likesRes.data ?? []).reduce(
        (sum: number, p: { likes_count: number }) => sum + (p.likes_count ?? 0),
        0
      );

      const metricsMap: Record<string, number> = {
        posts_count: postsCount,
        reels_count: reelsCount,
        followers_count: followersCount,
        total_likes: totalLikes,
      };

      const unearnedBadges = badges.filter((b) => b.earned_at === null);
      let grantedCount = 0;

      for (const badge of unearnedBadges) {
        const { data: badgeRow } = await dbLoose
          .from('achievement_badges')
          .select('criteria')
          .eq('id', badge.id)
          .single();

        if (!badgeRow) continue;

        const criteria = badgeRow.criteria as BadgeCriteria;
        if (criteria.type === 'manual') continue;

        const currentValue = metricsMap[criteria.type] ?? 0;
        if (currentValue >= criteria.threshold) {
          const { error: grantErr } = await dbLoose
            .from('user_badges')
            .upsert({ user_id: userId, badge_id: badge.id }, { onConflict: 'user_id,badge_id' });

          if (!grantErr) {
            grantedCount++;
          } else {
            logger.error('[useAchievements] Ошибка выдачи значка', { badge: badge.slug, error: grantErr });
          }
        }
      }

      if (grantedCount > 0) {
        toast.success(`Получено ${grantedCount} ${grantedCount === 1 ? 'значок' : 'значков'}!`);
        await loadBadges();
      }
    } catch (err) {
      logger.error('[useAchievements] Ошибка проверки достижений', { error: err });
      toast.error('Не удалось проверить достижения');
    }
  }, [user, userId, badges, loadBadges]);

  return { badges, earnedCount, checkAndGrant, loading } as const;
}
