/**
 * useSavedSearches — хук подписок на фильтры поиска недвижимости.
 *
 * - savedSearches — список сохранённых поисков
 * - saveSearch(name, filters) — сохранить текущие фильтры
 * - deleteSearch(id) — удалить подписку
 * - toggleNotify(id, field, value) — переключить уведомления
 */

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dbLoose } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

export interface PropertyFilters {
  propertyType?: string;
  dealType?: string;
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
  rooms?: string[];
  district?: string;
  city?: string;
}

export interface SavedSearch {
  id: string;
  user_id: string;
  name: string;
  filters: PropertyFilters;
  notify_email: boolean;
  notify_push: boolean;
  created_at: string;
  last_notified_at: string | null;
}

const SAVED_SEARCHES_KEY = ['saved-searches'] as const;

export function useSavedSearches() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: savedSearches = [], isLoading, error, refetch } = useQuery({
    queryKey: [...SAVED_SEARCHES_KEY, user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await dbLoose
        .from('property_saved_searches')
        .select('id, user_id, name, filters, notify_email, notify_push, created_at, last_notified_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        logger.error('[useSavedSearches] Ошибка загрузки подписок', { error });
        throw error;
      }
      return (data ?? []) as unknown as SavedSearch[];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const saveSearchMutation = useMutation({
    mutationFn: async (params: { name: string; filters: PropertyFilters }) => {
      if (!user) throw new Error('Требуется авторизация');

      const { data, error } = await dbLoose
        .from('property_saved_searches')
        .insert({
          user_id: user.id,
          name: params.name,
          filters: params.filters,
        })
        .select('id, user_id, name, filters, notify_email, notify_push, created_at, last_notified_at')
        .single();

      if (error) {
        logger.error('[useSavedSearches] Ошибка сохранения поиска', { error });
        throw error;
      }
      return data as unknown as SavedSearch;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SAVED_SEARCHES_KEY });
      toast.success('Поиск сохранён');
    },
    onError: () => {
      toast.error('Не удалось сохранить поиск');
    },
  });

  const deleteSearchMutation = useMutation({
    mutationFn: async (searchId: string) => {
      if (!user) throw new Error('Требуется авторизация');

      const { error } = await dbLoose
        .from('property_saved_searches')
        .delete()
        .eq('id', searchId)
        .eq('user_id', user.id);

      if (error) {
        logger.error('[useSavedSearches] Ошибка удаления подписки', { searchId, error });
        throw error;
      }
    },
    onMutate: async (searchId) => {
      await queryClient.cancelQueries({ queryKey: SAVED_SEARCHES_KEY });
      const previous = queryClient.getQueryData<SavedSearch[]>([...SAVED_SEARCHES_KEY, user?.id]);
      queryClient.setQueryData<SavedSearch[]>(
        [...SAVED_SEARCHES_KEY, user?.id],
        old => old?.filter(s => s.id !== searchId) ?? [],
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData([...SAVED_SEARCHES_KEY, user?.id], context.previous);
      }
      toast.error('Не удалось удалить подписку');
    },
    onSuccess: () => {
      toast.success('Подписка удалена');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SAVED_SEARCHES_KEY });
    },
  });

  const toggleNotifyMutation = useMutation({
    mutationFn: async (params: { searchId: string; field: 'notify_email' | 'notify_push'; value: boolean }) => {
      if (!user) throw new Error('Требуется авторизация');

      const { error } = await dbLoose
        .from('property_saved_searches')
        .update({ [params.field]: params.value })
        .eq('id', params.searchId)
        .eq('user_id', user.id);

      if (error) {
        logger.error('[useSavedSearches] Ошибка обновления уведомлений', { error });
        throw error;
      }
    },
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: SAVED_SEARCHES_KEY });
      const previous = queryClient.getQueryData<SavedSearch[]>([...SAVED_SEARCHES_KEY, user?.id]);
      queryClient.setQueryData<SavedSearch[]>(
        [...SAVED_SEARCHES_KEY, user?.id],
        old => old?.map(s => s.id === params.searchId ? { ...s, [params.field]: params.value } : s) ?? [],
      );
      return { previous };
    },
    onError: (_err, _params, context) => {
      if (context?.previous) {
        queryClient.setQueryData([...SAVED_SEARCHES_KEY, user?.id], context.previous);
      }
      toast.error('Не удалось обновить настройки уведомлений');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SAVED_SEARCHES_KEY });
    },
  });

  const saveSearch = useCallback(
    (name: string, filters: PropertyFilters) => saveSearchMutation.mutateAsync({ name, filters }),
    [saveSearchMutation],
  );

  const deleteSearch = useCallback(
    (searchId: string) => deleteSearchMutation.mutate(searchId),
    [deleteSearchMutation],
  );

  const toggleNotify = useCallback(
    (searchId: string, field: 'notify_email' | 'notify_push', value: boolean) =>
      toggleNotifyMutation.mutate({ searchId, field, value }),
    [toggleNotifyMutation],
  );

  return {
    savedSearches,
    isLoading,
    error,
    saveSearch,
    isSaving: saveSearchMutation.isPending,
    deleteSearch,
    isDeleting: deleteSearchMutation.isPending,
    toggleNotify,
    refetch,
  };
}
