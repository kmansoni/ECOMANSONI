/**
 * useAssets.ts — Hooks для пользовательских ассетов (загрузка, листинг, удаление).
 */

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { editorApi } from '../api';
import type { RegisterAssetInput, PaginationParams, AssetType } from '../types';

// ── Query keys ────────────────────────────────────────────────────────────

export const assetKeys = {
  all: ['editor-assets'] as const,
  list: (params?: Record<string, unknown>) =>
    [...assetKeys.all, 'list', params] as const,
};

// ── List assets ───────────────────────────────────────────────────────────

export interface AssetListParams extends PaginationParams {
  type?: AssetType;
  project_id?: string;
}

export function useAssets(params?: AssetListParams) {
  return useQuery({
    queryKey: assetKeys.list(params as Record<string, unknown>),
    queryFn: () => editorApi.listAssets(params),
    staleTime: 30_000,
  });
}

// ── Infinite scroll assets ────────────────────────────────────────────────

export function useInfiniteAssets(params?: Omit<AssetListParams, 'page'> & { limit?: number }) {
  const limit = params?.limit ?? 20;

  return useInfiniteQuery({
    queryKey: [...assetKeys.all, 'infinite', params],
    queryFn: ({ pageParam = 1 }) =>
      editorApi.listAssets({ ...params, page: pageParam, limit }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.has_more ? lastPage.page + 1 : undefined,
    staleTime: 30_000,
  });
}

// ── Register asset (after upload to storage) ──────────────────────────────

export function useRegisterAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RegisterAssetInput) => editorApi.registerAsset(data),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: assetKeys.all });
    },
  });
}

// ── Delete asset ──────────────────────────────────────────────────────────

export function useDeleteAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (assetId: string) => editorApi.deleteAsset(assetId),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: assetKeys.all });
    },
  });
}
