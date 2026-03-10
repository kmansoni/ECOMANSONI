/**
 * useStickers.ts — Hooks для стикер-паков и отдельных стикеров.
 */

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { editorApi } from '../api';
import type { PaginationParams } from '../types';

// ── Query keys ────────────────────────────────────────────────────────────

export const stickerKeys = {
  all: ['editor-stickers'] as const,
  packs: (params?: Record<string, unknown>) =>
    [...stickerKeys.all, 'packs', params] as const,
  pack: (id: string) => [...stickerKeys.all, 'pack', id] as const,
};

// ── List sticker packs ────────────────────────────────────────────────────

export function useStickerPacks(params?: PaginationParams) {
  return useQuery({
    queryKey: stickerKeys.packs(params as Record<string, unknown>),
    queryFn: () => editorApi.listStickerPacks(params),
    staleTime: 5 * 60_000,
  });
}

// ── Infinite scroll sticker packs ─────────────────────────────────────────

export function useInfiniteStickerPacks(params?: { limit?: number }) {
  const limit = params?.limit ?? 20;

  return useInfiniteQuery({
    queryKey: [...stickerKeys.all, 'infinite-packs', params],
    queryFn: ({ pageParam = 1 }) =>
      editorApi.listStickerPacks({ page: pageParam, limit }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.has_more ? lastPage.page + 1 : undefined,
    staleTime: 5 * 60_000,
  });
}

// ── Get sticker pack with items ───────────────────────────────────────────

export function useStickerPack(packId: string | undefined) {
  return useQuery({
    queryKey: stickerKeys.pack(packId ?? ''),
    queryFn: () => editorApi.getStickerPack(packId!),
    enabled: !!packId,
    staleTime: 5 * 60_000,
  });
}
