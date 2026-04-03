/**
 * usePropertyViews — хук истории просмотров объектов недвижимости.
 *
 * - recordView(propertyId) — с дебаунсом 30 мин на один объект
 * - viewHistory — список просмотренных объектов
 * - clearHistory() — очистка истории
 * - hasMore / fetchMore — пагинация
 */

import { useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dbLoose } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

export interface PropertyView {
  id: string;
  user_id: string;
  property_id: string;
  viewed_at: string;
  duration_seconds: number;
}

const VIEW_HISTORY_KEY = ['property-views'] as const;
const PAGE_SIZE = 20;
const DEBOUNCE_MS = 30 * 60 * 1000; // 30 минут

export function usePropertyViews() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const recentViewsRef = useRef<Map<string, number>>(new Map());

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: [...VIEW_HISTORY_KEY, user?.id],
    queryFn: async ({ pageParam = 0 }) => {
      if (!user) return [];
      const { data, error } = await dbLoose
        .from('property_views')
        .select('id, user_id, property_id, viewed_at, duration_seconds')
        .eq('user_id', user.id)
        .order('viewed_at', { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1)
        .limit(PAGE_SIZE);

      if (error) {
        logger.error('[usePropertyViews] Ошибка загрузки истории', { error });
        throw error;
      }
      return (data ?? []) as unknown as PropertyView[];
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.reduce((sum, page) => sum + page.length, 0);
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const viewHistory = data?.pages.flat() ?? [];

  const recordViewMutation = useMutation({
    mutationFn: async (propertyId: string) => {
      if (!user) throw new Error('Требуется авторизация');

      // Дебаунс: не записываем повторный просмотр того же объекта в течение 30 мин
      const lastViewed = recentViewsRef.current.get(propertyId);
      if (lastViewed && Date.now() - lastViewed < DEBOUNCE_MS) {
        return null;
      }

      const { data, error } = await dbLoose
        .from('property_views')
        .insert({ user_id: user.id, property_id: propertyId })
        .select('id, user_id, property_id, viewed_at, duration_seconds')
        .single();

      if (error) {
        logger.error('[usePropertyViews] Ошибка записи просмотра', { propertyId, error });
        throw error;
      }

      recentViewsRef.current.set(propertyId, Date.now());
      return data as unknown as PropertyView;
    },
    onSuccess: (result) => {
      if (result) {
        queryClient.invalidateQueries({ queryKey: VIEW_HISTORY_KEY });
      }
    },
    onError: () => {
      // Не показываем toast — запись просмотра фоновая операция
      logger.error('[usePropertyViews] Не удалось записать просмотр');
    },
  });

  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Требуется авторизация');

      const { error } = await dbLoose
        .from('property_views')
        .delete()
        .eq('user_id', user.id);

      if (error) {
        logger.error('[usePropertyViews] Ошибка очистки истории', { error });
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.setQueryData([...VIEW_HISTORY_KEY, user?.id], { pages: [[]], pageParams: [0] });
      recentViewsRef.current.clear();
      toast.success('История просмотров очищена');
    },
    onError: () => {
      toast.error('Не удалось очистить историю');
    },
  });

  const recordView = useCallback(
    (propertyId: string) => recordViewMutation.mutate(propertyId),
    [recordViewMutation],
  );

  const clearHistory = useCallback(
    () => clearHistoryMutation.mutate(),
    [clearHistoryMutation],
  );

  return {
    viewHistory,
    isLoading,
    error,
    recordView,
    clearHistory,
    isClearingHistory: clearHistoryMutation.isPending,
    fetchMore: fetchNextPage,
    hasMore: !!hasNextPage,
    isFetchingMore: isFetchingNextPage,
    refetch,
  };
}
