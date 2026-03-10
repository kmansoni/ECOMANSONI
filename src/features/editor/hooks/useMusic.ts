/**
 * useMusic.ts — Hooks для поиска и получения музыкальных треков.
 */

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { editorApi } from '../api';
import type { PaginationParams, MusicGenre, MusicMood } from '../types';

// ── Query keys ────────────────────────────────────────────────────────────

export const musicKeys = {
  all: ['editor-music'] as const,
  search: (params: Record<string, unknown>) =>
    [...musicKeys.all, 'search', params] as const,
  detail: (id: string) => [...musicKeys.all, 'detail', id] as const,
};

// ── Search params ─────────────────────────────────────────────────────────

export interface MusicSearchParams extends PaginationParams {
  query?: string;
  genre?: MusicGenre;
  mood?: MusicMood;
  bpm_min?: number;
  bpm_max?: number;
}

// ── Search music ──────────────────────────────────────────────────────────

export function useSearchMusic(params: MusicSearchParams) {
  return useQuery({
    queryKey: musicKeys.search(params as Record<string, unknown>),
    queryFn: () => editorApi.searchMusic(params),
    staleTime: 60_000,
    enabled: true,
  });
}

// ── Infinite scroll music ─────────────────────────────────────────────────

export function useInfiniteMusic(params?: Omit<MusicSearchParams, 'page'> & { limit?: number }) {
  const limit = params?.limit ?? 20;

  return useInfiniteQuery({
    queryKey: [...musicKeys.all, 'infinite', params],
    queryFn: ({ pageParam = 1 }) =>
      editorApi.searchMusic({ ...params, page: pageParam, limit }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.has_more ? lastPage.page + 1 : undefined,
    staleTime: 60_000,
  });
}

// ── Get single track ──────────────────────────────────────────────────────

export function useMusicTrack(trackId: string | undefined) {
  return useQuery({
    queryKey: musicKeys.detail(trackId ?? ''),
    queryFn: () => editorApi.getMusicTrack(trackId!),
    enabled: !!trackId,
  });
}
