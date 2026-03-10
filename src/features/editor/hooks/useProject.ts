/**
 * useProject.ts — TanStack Query hooks для CRUD проектов.
 *
 * При загрузке проекта (getProject) результат автоматически
 * синхронизируется с editor-store через onSuccess.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { editorApi } from '../api';
import { useEditorStore } from '../stores/editor-store';
import { useHistoryStore } from '../stores/history-store';
import { useTimelineStore } from '../stores/timeline-store';
import type {
  CreateProjectInput,
  UpdateProjectInput,
  EditorProject,
  TrackWithClips,
} from '../types';

// ── Query Keys ────────────────────────────────────────────────────────────

export const projectKeys = {
  all: ['editor-projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  detail: (id: string) => [...projectKeys.all, 'detail', id] as const,
};

// ── Load project ──────────────────────────────────────────────────────────

export function useProject(projectId: string | undefined) {
  const setProject = useEditorStore((s) => s.setProject);
  const clearHistory = useHistoryStore((s) => s.clear);
  const seek = useTimelineStore((s) => s.seek);

  return useQuery({
    queryKey: projectKeys.detail(projectId ?? ''),
    queryFn: async () => {
      const result = await editorApi.getProject(projectId!);
      return result;
    },
    enabled: !!projectId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    select(data: { project: EditorProject; tracks: TrackWithClips[] }) {
      // Синхронизируем store при каждом получении данных
      setProject(data.project, data.tracks);
      clearHistory();
      seek(0);
      return data;
    },
  });
}

// ── Create project ────────────────────────────────────────────────────────

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProjectInput) => editorApi.createProject(data),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

// ── Update project ────────────────────────────────────────────────────────

export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient();
  const updateProjectLocal = useEditorStore((s) => s.updateProjectLocal);

  return useMutation({
    mutationFn: (data: UpdateProjectInput) =>
      editorApi.updateProject(projectId, data),

    onMutate(data) {
      // Оптимистичное обновление
      updateProjectLocal(data as Partial<EditorProject>);
    },

    onError() {
      // При ошибке перезагружаем проект с сервера
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },

    onSuccess(updatedProject) {
      // Обновляем кэш TanStack Query
      queryClient.setQueryData(
        projectKeys.detail(projectId),
        (old: { project: EditorProject; tracks: TrackWithClips[] } | undefined) => {
          if (!old) return old;
          return { ...old, project: updatedProject };
        },
      );
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}

// ── Delete project ────────────────────────────────────────────────────────

export function useDeleteProject() {
  const queryClient = useQueryClient();
  const clearProject = useEditorStore((s) => s.clearProject);

  return useMutation({
    mutationFn: (projectId: string) => editorApi.deleteProject(projectId),
    onSuccess(_data, projectId) {
      clearProject();
      queryClient.removeQueries({ queryKey: projectKeys.detail(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}

// ── Duplicate project ─────────────────────────────────────────────────────

export function useDuplicateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: string) => editorApi.duplicateProject(projectId),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}
