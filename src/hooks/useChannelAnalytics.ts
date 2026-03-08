/**
 * useChannelAnalytics — хук для аналитики каналов.
 *
 * Загружает агрегированную статистику через Edge Function channel-analytics.
 * Записывает просмотры идемпотентно (per user per post).
 *
 * Безопасность:
 *  - Все запросы требуют JWT (передаётся через supabase.functions.invoke)
 *  - Смена period сбрасывает кэш и перезагружает данные
 *  - recordView дедуплицируется на уровне БД (PRIMARY KEY user_id × post_id)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnalyticsPeriod = "7d" | "30d" | "90d" | "all";

export interface DailyStat {
  id: string;
  channel_id: string;
  date: string;
  subscribers_count: number;
  subscribers_gained: number;
  subscribers_lost: number;
  views_count: number;
  shares_count: number;
  reactions_count: number;
  comments_count: number;
  reach_count: number;
  avg_view_time_seconds: number;
  created_at: string;
}

export interface PostStat {
  post_id: string;
  views: number;
  forwards: number;
  reactions: Record<string, number>;
  comments_count: number;
  reach: number;
  created_at: string;
}

export interface AnalyticsOverview {
  total_views: number;
  total_shares: number;
  total_reactions: number;
  total_reach: number;
  subscribers_gained: number;
  subscribers_lost: number;
  latest_subscribers: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChannelAnalytics(channelId: string) {
  const [period, setPeriodState] = useState<AnalyticsPeriod>("30d");
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [topPosts, setTopPosts] = useState<PostStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadAnalytics = useCallback(async (ch: string, p: AnalyticsPeriod) => {
    if (!ch) return;

    // Отменить предыдущий запрос
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const [overviewRes, postsRes] = await Promise.all([
        supabase.functions.invoke("channel-analytics", {
          method: "GET",
          headers: { "x-query": `channel_id=${ch}&period=${p}` },
          body: null,
        }),
        supabase.functions.invoke("channel-analytics", {
          method: "GET",
          headers: { "x-query": `channel_id=${ch}&limit=20&offset=0` },
          body: null,
        }),
      ]);

      if (overviewRes.error) throw new Error(overviewRes.error.message);
      if (postsRes.error) throw new Error(postsRes.error.message);

      const overviewData = overviewRes.data as {
        overview: AnalyticsOverview;
        dailyStats: DailyStat[];
      };
      const postsData = postsRes.data as { posts: PostStat[] };

      setOverview(overviewData.overview ?? null);
      setDailyStats(overviewData.dailyStats ?? []);
      setTopPosts(postsData.posts ?? []);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Ошибка загрузки аналитики");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAnalytics(channelId, period);
    return () => abortRef.current?.abort();
  }, [channelId, period, loadAnalytics]);

  const setPeriod = useCallback((p: AnalyticsPeriod) => {
    setPeriodState(p);
  }, []);

  /**
   * recordView — идемпотентная запись просмотра поста.
   * Вызывается при попадании поста во viewport, дедуплицируется на сервере.
   */
  const recordView = useCallback(async (postId: string) => {
    if (!postId || !channelId) return;

    const { error: invErr } = await supabase.functions.invoke("channel-analytics", {
      method: "POST",
      headers: { "x-path": "/record-view" },
      body: { post_id: postId, channel_id: channelId },
    });

    if (invErr) {
      // Не блокируем UX — просмотр не критичен
      console.warn("[useChannelAnalytics] recordView error:", invErr.message);
    }
  }, [channelId]);

  return {
    overview,
    dailyStats,
    topPosts,
    period,
    setPeriod,
    recordView,
    isLoading,
    error,
    reload: () => loadAnalytics(channelId, period),
  };
}
