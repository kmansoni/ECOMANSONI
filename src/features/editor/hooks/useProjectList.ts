/**
 * useProjectList.ts — TanStack Query hook для списка проектов с pagination.
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { editorApi } from '../api';
import { projectKeys } from './useProject';
import type { PaginationParams } from '../types';

export function useProjectList(params?: PaginationParams) {
  return useQuery({
    queryKey: [...projectKeys.lists(), params],
    queryFn: () => editorApi.listProjects(params),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
