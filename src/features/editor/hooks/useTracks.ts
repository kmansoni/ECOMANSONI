/**
 * useTracks.ts — CRUD hooks для дорожек с оптимистичными обновлениями.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { editorApi } from '../api';
import { useEditorStore } from '../stores/editor-store';
import { useHistoryStore } from '../stores/history-store';
import { projectKeys } from './useProject';
import type {
  CreateTrackInput,
  UpdateTrackInput,
  TrackWithClips,
  ReorderItem,
} from '../types';

// ── Create Track ──────────────────────────────────────────────────────────

export function useCreateTrack(projectId: string) {
  const queryClient = useQueryClient();
  const addTrackLocal = useEditorStore((s) => s.addTrackLocal);
  const removeTrackLocal = useEditorStore((s) => s.removeTrackLocal);
  const historyPush = useHistoryStore((s) => s.push);

  return useMutation({
    mutationFn: (data: CreateTrackInput) => editorApi.createTrack(projectId, data),

    onMutate(data) {
      // Создаём оптимистичную дорожку с временным ID
      const tempId = `temp_track_${Date.now()}`;
      const optimistic: TrackWithClips = {
        id: tempId,
        project_id: projectId,
        type: data.type,
        name: data.name ?? `${data.type} track`,
        sort_order: data.sort_order ?? 999,
        is_locked: false,
        is_visible: true,
        volume: 1,
        opacity: 1,
        blend_mode: 'normal',
        clips: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      addTrackLocal(optimistic);
      return { tempId, optimistic };
    },

    onSuccess(serverTrack, _data, context) {
      if (!context) return;
      // Заменяем оптимистичную дорожку реальной
      removeTrackLocal(context.tempId);
      const trackWithClips: TrackWithClips = { ...serverTrack, clips: [] };
      addTrackLocal(trackWithClips);

      // History entry
      historyPush({
        label: `Создать дорожку "${serverTrack.name}"`,
        undo: () => removeTrackLocal(serverTrack.id),
        redo: () => addTrackLocal(trackWithClips),
      });
    },

    onError(_err, _data, context) {
      if (context) removeTrackLocal(context.tempId);
    },

    onSettled() {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}

// ── Update Track ──────────────────────────────────────────────────────────

export function useUpdateTrack(projectId: string) {
  const queryClient = useQueryClient();
  const updateTrackLocal = useEditorStore((s) => s.updateTrackLocal);
  const getTrackById = useEditorStore((s) => s.getTrackById);
  const historyPush = useHistoryStore((s) => s.push);

  return useMutation({
    mutationFn: ({ trackId, data }: { trackId: string; data: UpdateTrackInput }) =>
      editorApi.updateTrack(projectId, trackId, data),

    onMutate({ trackId, data }) {
      const previous = getTrackById(trackId);
      updateTrackLocal(trackId, data);
      return { trackId, previous };
    },

    onSuccess(serverTrack, { trackId }, context) {
      updateTrackLocal(trackId, serverTrack);

      if (context?.previous) {
        const prev = context.previous;
        historyPush({
          label: `Обновить дорожку "${serverTrack.name}"`,
          undo: () => updateTrackLocal(trackId, prev),
          redo: () => updateTrackLocal(trackId, serverTrack),
        });
      }
    },

    onError(_err, { trackId }, context) {
      if (context?.previous) {
        updateTrackLocal(trackId, context.previous);
      }
    },

    onSettled() {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}

// ── Delete Track ──────────────────────────────────────────────────────────

export function useDeleteTrack(projectId: string) {
  const queryClient = useQueryClient();
  const removeTrackLocal = useEditorStore((s) => s.removeTrackLocal);
  const addTrackLocal = useEditorStore((s) => s.addTrackLocal);
  const getTrackById = useEditorStore((s) => s.getTrackById);
  const historyPush = useHistoryStore((s) => s.push);

  return useMutation({
    mutationFn: (trackId: string) => editorApi.deleteTrack(projectId, trackId),

    onMutate(trackId) {
      const previous = getTrackById(trackId);
      removeTrackLocal(trackId);
      return { trackId, previous };
    },

    onSuccess(_data, trackId, context) {
      if (context?.previous) {
        const prev = context.previous;
        historyPush({
          label: `Удалить дорожку "${prev.name}"`,
          undo: () => addTrackLocal(prev),
          redo: () => removeTrackLocal(trackId),
        });
      }
    },

    onError(_err, _trackId, context) {
      if (context?.previous) {
        addTrackLocal(context.previous);
      }
    },

    onSettled() {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}

// ── Reorder Tracks ────────────────────────────────────────────────────────

export function useReorderTracks(projectId: string) {
  const queryClient = useQueryClient();
  const reorderTracksLocal = useEditorStore((s) => s.reorderTracksLocal);
  const tracks = useEditorStore((s) => s.tracks);

  return useMutation({
    mutationFn: (items: ReorderItem[]) => editorApi.reorderTracks(projectId, items),

    onMutate(items) {
      const previousOrder = tracks.map((t) => ({
        id: t.id,
        sort_order: t.sort_order,
      }));
      reorderTracksLocal(items);
      return { previousOrder };
    },

    onError(_err, _items, context) {
      if (context?.previousOrder) {
        reorderTracksLocal(context.previousOrder);
      }
    },

    onSettled() {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}
