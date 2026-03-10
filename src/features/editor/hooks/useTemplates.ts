/**
 * useTemplates.ts — Hooks для шаблонов проектов.
 */

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { editorApi } from '../api';
import { projectKeys } from './useProject';
import type { PaginationParams, TemplateCategory } from '../types';

// ── Query keys ────────────────────────────────────────────────────────────

export const templateKeys = {
  all: ['editor-templates'] as const,
  list: (params?: Record<string, unknown>) =>
    [...templateKeys.all, 'list', params] as const,
  detail: (id: string) => [...templateKeys.all, 'detail', id] as const,
};

// ── List templates (paginated) ────────────────────────────────────────────

export function useTemplates(params?: PaginationParams & { category?: TemplateCategory; search?: string }) {
  return useQuery({
    queryKey: templateKeys.list(params as Record<string, unknown>),
    queryFn: () => editorApi.listTemplates(params),
    staleTime: 60_000,
  });
}

// ── Infinite scroll templates ─────────────────────────────────────────────

export function useInfiniteTemplates(params?: { category?: TemplateCategory; search?: string; limit?: number }) {
  const limit = params?.limit ?? 20;

  return useInfiniteQuery({
    queryKey: [...templateKeys.all, 'infinite', params],
    queryFn: ({ pageParam = 1 }) =>
      editorApi.listTemplates({ ...params, page: pageParam, limit }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.has_more ? lastPage.page + 1 : undefined,
    staleTime: 60_000,
  });
}

// ── Get single template ───────────────────────────────────────────────────

export function useTemplate(templateId: string | undefined) {
  return useQuery({
    queryKey: templateKeys.detail(templateId ?? ''),
    queryFn: () => editorApi.getTemplate(templateId!),
    enabled: !!templateId,
  });
}

// ── Apply template (creates new project) ──────────────────────────────────

export function useApplyTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ templateId, title }: { templateId: string; title?: string }) =>
      editorApi.applyTemplate(templateId, title),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}
