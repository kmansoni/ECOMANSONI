/**
 * useAgencyReviews — хук рейтингов и отзывов агентств недвижимости.
 *
 * - reviews — список отзывов с пагинацией
 * - addReview(agencyId, rating, text, pros, cons)
 * - avgRating — средний рейтинг агентства
 * - reviewCount — количество отзывов
 */

import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dbLoose } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

export interface AgencyReview {
  id: string;
  agency_id: string;
  user_id: string;
  rating: number;
  text: string | null;
  pros: string | null;
  cons: string | null;
  created_at: string;
}

interface AgencyStats {
  avg_rating: number;
  review_count: number;
}

const REVIEWS_KEY = (agencyId: string) => ['agency-reviews', agencyId] as const;
const STATS_KEY = (agencyId: string) => ['agency-stats', agencyId] as const;
const PAGE_SIZE = 15;

export function useAgencyReviews(agencyId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Средний рейтинг
  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: STATS_KEY(agencyId),
    queryFn: async (): Promise<AgencyStats> => {
      const { data, error } = await dbLoose
        .from('agency_reviews')
        .select('rating')
        .eq('agency_id', agencyId)
        .limit(1000);

      if (error) {
        logger.error('[useAgencyReviews] Ошибка загрузки статистики', { agencyId, error });
        throw error;
      }

      const rows = (data ?? []) as unknown as { rating: number }[];
      if (rows.length === 0) return { avg_rating: 0, review_count: 0 };

      const sum = rows.reduce((acc, r) => acc + r.rating, 0);
      return {
        avg_rating: Math.round((sum / rows.length) * 10) / 10,
        review_count: rows.length,
      };
    },
    enabled: !!agencyId,
    staleTime: 60_000,
  });

  // Список отзывов с пагинацией
  const {
    data: reviewsData,
    isLoading: isReviewsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: REVIEWS_KEY(agencyId),
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await dbLoose
        .from('agency_reviews')
        .select('id, agency_id, user_id, rating, text, pros, cons, created_at')
        .eq('agency_id', agencyId)
        .order('created_at', { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1)
        .limit(PAGE_SIZE);

      if (error) {
        logger.error('[useAgencyReviews] Ошибка загрузки отзывов', { agencyId, error });
        throw error;
      }
      return (data ?? []) as unknown as AgencyReview[];
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.reduce((sum, page) => sum + page.length, 0);
    },
    enabled: !!agencyId,
    staleTime: 60_000,
  });

  const reviews = useMemo(() => reviewsData?.pages.flat() ?? [], [reviewsData]);

  // Отзыв текущего пользователя
  const userReview = useMemo(
    () => (user ? reviews.find(r => r.user_id === user.id) : undefined),
    [reviews, user],
  );

  // Добавить / обновить отзыв
  const addReviewMutation = useMutation({
    mutationFn: async (params: {
      rating: number;
      text?: string;
      pros?: string;
      cons?: string;
    }) => {
      if (!user) throw new Error('Требуется авторизация');

      const { data, error } = await dbLoose
        .from('agency_reviews')
        .upsert(
          {
            agency_id: agencyId,
            user_id: user.id,
            rating: params.rating,
            text: params.text ?? null,
            pros: params.pros ?? null,
            cons: params.cons ?? null,
          },
          { onConflict: 'agency_id,user_id' },
        )
        .select('id, agency_id, user_id, rating, text, pros, cons, created_at')
        .single();

      if (error) {
        logger.error('[useAgencyReviews] Ошибка сохранения отзыва', { agencyId, error });
        throw error;
      }
      return data as unknown as AgencyReview;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REVIEWS_KEY(agencyId) });
      queryClient.invalidateQueries({ queryKey: STATS_KEY(agencyId) });
      toast.success('Отзыв сохранён');
    },
    onError: () => {
      toast.error('Не удалось сохранить отзыв');
    },
  });

  const addReview = useCallback(
    (params: { rating: number; text?: string; pros?: string; cons?: string }) =>
      addReviewMutation.mutateAsync(params),
    [addReviewMutation],
  );

  return {
    reviews,
    isLoading: isReviewsLoading || isStatsLoading,
    avgRating: stats?.avg_rating ?? 0,
    reviewCount: stats?.review_count ?? 0,
    userReview,
    addReview,
    isAddingReview: addReviewMutation.isPending,
    fetchMore: fetchNextPage,
    hasMore: !!hasNextPage,
    isFetchingMore: isFetchingNextPage,
    refetch,
  };
}
