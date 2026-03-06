import { useState, useCallback, useEffect } from 'react';
import type { TripHistoryItem } from '@/types/taxi';
import { getOrderHistory } from '@/lib/taxi/api';

interface HistoryState {
  items: TripHistoryItem[];
  total: number;
  page: number;
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
  filter: 'all' | 'completed' | 'cancelled';
}

export function useTaxiHistory() {
  const [state, setState] = useState<HistoryState>({
    items: [],
    total: 0,
    page: 1,
    hasMore: false,
    isLoading: false,
    error: null,
    filter: 'all',
  });

  // ─── Загрузить историю ─────────────────────────────────────────────────────
  const loadHistory = useCallback(
    async (page = 1, filter: HistoryState['filter'] = 'all', append = false) => {
      setState((s) => ({ ...s, isLoading: true, error: null }));

      try {
        const result = await getOrderHistory({
          page,
          limit: 10,
          status: filter === 'all' ? undefined : filter,
        });

        setState((s) => ({
          ...s,
          items: append ? [...s.items, ...result.items] : result.items,
          total: result.total,
          hasMore: result.hasMore,
          page,
          isLoading: false,
        }));
      } catch {
        setState((s) => ({
          ...s,
          error: 'Не удалось загрузить историю поездок',
          isLoading: false,
        }));
      }
    },
    []
  );

  // ─── Загрузить следующую страницу ─────────────────────────────────────────
  const loadMore = useCallback(() => {
    if (state.hasMore && !state.isLoading) {
      loadHistory(state.page + 1, state.filter, true);
    }
  }, [state.hasMore, state.isLoading, state.page, state.filter, loadHistory]);

  // ─── Сменить фильтр ────────────────────────────────────────────────────────
  const setFilter = useCallback(
    (filter: HistoryState['filter']) => {
      setState((s) => ({ ...s, filter, items: [], page: 1 }));
      loadHistory(1, filter, false);
    },
    [loadHistory]
  );

  // ─── Обновить (pull-to-refresh) ────────────────────────────────────────────
  const refresh = useCallback(() => {
    loadHistory(1, state.filter, false);
  }, [state.filter, loadHistory]);

  // ─── Начальная загрузка ────────────────────────────────────────────────────
  useEffect(() => {
    loadHistory(1, 'all', false);
  }, [loadHistory]);

  return {
    items: state.items,
    total: state.total,
    hasMore: state.hasMore,
    isLoading: state.isLoading,
    error: state.error,
    filter: state.filter,

    loadHistory,
    loadMore,
    setFilter,
    refresh,
  };
}
