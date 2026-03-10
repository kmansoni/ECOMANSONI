/**
 * useKeyframes.ts — Batch upsert и удаление кейфреймов.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { editorApi } from '../api';
import { useEditorStore } from '../stores/editor-store';
import { projectKeys } from './useProject';
import type { KeyframeUpsertInput } from '../types';

// ── Batch Upsert Keyframes ────────────────────────────────────────────────

export function useUpsertKeyframes(projectId: string) {
  const queryClient = useQueryClient();
  const setKeyframesLocal = useEditorStore((s) => s.setKeyframesLocal);

  return useMutation({
    mutationFn: (keyframes: KeyframeUpsertInput[]) =>
      editorApi.upsertKeyframes(projectId, keyframes),

    onSuccess(serverKeyframes) {
      // Группируем по clip_id и обновляем store
      const byClip = new Map<string, typeof serverKeyframes>();
      for (const kf of serverKeyframes) {
        const existing = byClip.get(kf.clip_id) ?? [];
        existing.push(kf);
        byClip.set(kf.clip_id, existing);
      }
      for (const [clipId, kfs] of byClip) {
        setKeyframesLocal(clipId, kfs);
      }
    },

    onSettled() {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}

// ── Delete Keyframe ───────────────────────────────────────────────────────

export function useDeleteKeyframe(projectId: string) {
  const queryClient = useQueryClient();
  const removeKeyframeLocal = useEditorStore((s) => s.removeKeyframeLocal);

  return useMutation({
    mutationFn: (keyframeId: string) =>
      editorApi.deleteKeyframe(projectId, keyframeId),

    onMutate(keyframeId) {
      removeKeyframeLocal(keyframeId);
      return { keyframeId };
    },

    onError() {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },

    onSettled() {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}
