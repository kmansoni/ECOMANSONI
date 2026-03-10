/**
 * useClips.ts — CRUD hooks для клипов + split + duplicate.
 *
 * Все мутации используют оптимистичные обновления через editor-store
 * для мгновенного отклика UI при перемещении/ресайзе клипов.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { editorApi } from '../api';
import { useEditorStore } from '../stores/editor-store';
import { useHistoryStore } from '../stores/history-store';
import { useTimelineStore } from '../stores/timeline-store';
import { projectKeys } from './useProject';
import { DEFAULT_CLIP_TRANSFORM } from '../constants';
import type {
  CreateClipInput,
  UpdateClipInput,
  ClipWithDetails,
  EditorClip,
} from '../types';

// ── Create Clip ───────────────────────────────────────────────────────────

export function useCreateClip(projectId: string) {
  const queryClient = useQueryClient();
  const addClipLocal = useEditorStore((s) => s.addClipLocal);
  const removeClipLocal = useEditorStore((s) => s.removeClipLocal);
  const historyPush = useHistoryStore((s) => s.push);

  return useMutation({
    mutationFn: (data: CreateClipInput) => editorApi.createClip(projectId, data),

    onMutate(data) {
      const tempId = `temp_clip_${Date.now()}`;
      const optimistic: ClipWithDetails = {
        id: tempId,
        track_id: data.track_id,
        project_id: projectId,
        type: data.type,
        name: data.name ?? `${data.type} clip`,
        start_ms: data.start_ms,
        duration_ms: data.duration_ms,
        source_url: data.source_url ?? null,
        source_start_ms: data.source_start_ms ?? 0,
        source_end_ms: data.source_end_ms ?? null,
        volume: 1,
        speed: 1,
        speed_ramp: null,
        transform: { ...DEFAULT_CLIP_TRANSFORM },
        crop: null,
        filters: [],
        transition_in: null,
        transition_out: null,
        text_content: data.text_content ?? null,
        text_style: data.text_style ?? null,
        sticker_id: data.sticker_id ?? null,
        sort_order: 0,
        is_reversed: false,
        effects: [],
        keyframes: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      addClipLocal(data.track_id, optimistic);
      return { tempId, trackId: data.track_id };
    },

    onSuccess(serverClip, data, context) {
      if (!context) return;
      removeClipLocal(context.tempId);
      const clipWithDetails: ClipWithDetails = {
        ...serverClip,
        effects: [],
        keyframes: [],
      };
      addClipLocal(data.track_id, clipWithDetails);

      historyPush({
        label: `Создать клип "${serverClip.name}"`,
        undo: () => removeClipLocal(serverClip.id),
        redo: () => addClipLocal(data.track_id, clipWithDetails),
      });
    },

    onError(_err, _data, context) {
      if (context) removeClipLocal(context.tempId);
    },

    onSettled() {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}

// ── Update Clip ───────────────────────────────────────────────────────────

export function useUpdateClip(projectId: string) {
  const queryClient = useQueryClient();
  const updateClipLocal = useEditorStore((s) => s.updateClipLocal);
  const getClipById = useEditorStore((s) => s.getClipById);
  const historyPush = useHistoryStore((s) => s.push);

  return useMutation({
    mutationFn: ({ clipId, data }: { clipId: string; data: UpdateClipInput }) =>
      editorApi.updateClip(projectId, clipId, data),

    onMutate({ clipId, data }) {
      const previous = getClipById(clipId);
      updateClipLocal(clipId, data as Partial<EditorClip>);
      return { clipId, previous };
    },

    onSuccess(serverClip, { clipId }, context) {
      updateClipLocal(clipId, serverClip);

      if (context?.previous) {
        const prev = context.previous;
        historyPush({
          label: `Обновить клип "${serverClip.name}"`,
          undo: () => updateClipLocal(clipId, prev),
          redo: () => updateClipLocal(clipId, serverClip),
        });
      }
    },

    onError(_err, { clipId }, context) {
      if (context?.previous) {
        updateClipLocal(clipId, context.previous);
      }
    },

    onSettled() {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}

// ── Delete Clip ───────────────────────────────────────────────────────────

export function useDeleteClip(projectId: string) {
  const queryClient = useQueryClient();
  const removeClipLocal = useEditorStore((s) => s.removeClipLocal);
  const addClipLocal = useEditorStore((s) => s.addClipLocal);
  const getClipById = useEditorStore((s) => s.getClipById);
  const getTrackByClipId = useEditorStore((s) => s.getTrackByClipId);
  const clearSelection = useTimelineStore((s) => s.clearSelection);
  const historyPush = useHistoryStore((s) => s.push);

  return useMutation({
    mutationFn: (clipId: string) => editorApi.deleteClip(projectId, clipId),

    onMutate(clipId) {
      const previous = getClipById(clipId);
      const track = getTrackByClipId(clipId);
      removeClipLocal(clipId);
      clearSelection();
      return { clipId, previous, trackId: track?.id };
    },

    onSuccess(_data, clipId, context) {
      if (context?.previous && context.trackId) {
        const prev = context.previous;
        const tid = context.trackId;
        historyPush({
          label: `Удалить клип "${prev.name}"`,
          undo: () => addClipLocal(tid, prev),
          redo: () => removeClipLocal(clipId),
        });
      }
    },

    onError(_err, _clipId, context) {
      if (context?.previous && context.trackId) {
        addClipLocal(context.trackId, context.previous);
      }
    },

    onSettled() {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}

// ── Split Clip ────────────────────────────────────────────────────────────

export function useSplitClip(projectId: string) {
  const queryClient = useQueryClient();
  const historyPush = useHistoryStore((s) => s.push);
  const removeClipLocal = useEditorStore((s) => s.removeClipLocal);
  const addClipLocal = useEditorStore((s) => s.addClipLocal);
  const getClipById = useEditorStore((s) => s.getClipById);
  const getTrackByClipId = useEditorStore((s) => s.getTrackByClipId);

  return useMutation({
    mutationFn: ({ clipId, splitAtMs }: { clipId: string; splitAtMs: number }) =>
      editorApi.splitClip(projectId, clipId, splitAtMs),

    onSuccess({ left, right }, { clipId }) {
      const track = getTrackByClipId(clipId);
      if (!track) return;

      removeClipLocal(clipId);
      const leftFull: ClipWithDetails = { ...left, effects: [], keyframes: [] };
      const rightFull: ClipWithDetails = { ...right, effects: [], keyframes: [] };
      addClipLocal(track.id, leftFull);
      addClipLocal(track.id, rightFull);

      const originalClip = getClipById(clipId);
      historyPush({
        label: 'Разрезать клип',
        undo: () => {
          removeClipLocal(left.id);
          removeClipLocal(right.id);
          if (originalClip) addClipLocal(track.id, originalClip);
        },
        redo: () => {
          if (originalClip) removeClipLocal(originalClip.id);
          addClipLocal(track.id, leftFull);
          addClipLocal(track.id, rightFull);
        },
      });
    },

    onSettled() {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}

// ── Duplicate Clip ────────────────────────────────────────────────────────

export function useDuplicateClip(projectId: string) {
  const queryClient = useQueryClient();
  const addClipLocal = useEditorStore((s) => s.addClipLocal);
  const removeClipLocal = useEditorStore((s) => s.removeClipLocal);
  const getClipById = useEditorStore((s) => s.getClipById);
  const historyPush = useHistoryStore((s) => s.push);

  return useMutation({
    mutationFn: (clipId: string) => editorApi.duplicateClip(projectId, clipId),

    onSuccess(serverClip, clipId) {
      const original = getClipById(clipId);
      const trackId = original?.track_id ?? serverClip.track_id;
      const full: ClipWithDetails = { ...serverClip, effects: [], keyframes: [] };
      addClipLocal(trackId, full);

      historyPush({
        label: `Дублировать клип "${serverClip.name}"`,
        undo: () => removeClipLocal(serverClip.id),
        redo: () => addClipLocal(trackId, full),
      });
    },

    onSettled() {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}
