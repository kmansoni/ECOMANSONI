/**
 * useEffects.ts — CRUD hooks для эффектов клипов.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { editorApi } from '../api';
import { useEditorStore } from '../stores/editor-store';
import { useHistoryStore } from '../stores/history-store';
import { projectKeys } from './useProject';
import type {
  CreateEffectInput,
  UpdateEffectInput,
  EditorEffect,
} from '../types';

// ── Create Effect ─────────────────────────────────────────────────────────

export function useCreateEffect(projectId: string) {
  const queryClient = useQueryClient();
  const addEffectLocal = useEditorStore((s) => s.addEffectLocal);
  const removeEffectLocal = useEditorStore((s) => s.removeEffectLocal);
  const historyPush = useHistoryStore((s) => s.push);

  return useMutation({
    mutationFn: (data: CreateEffectInput) => editorApi.createEffect(projectId, data),

    onMutate(data) {
      const tempId = `temp_effect_${Date.now()}`;
      const optimistic: EditorEffect = {
        id: tempId,
        clip_id: data.clip_id,
        project_id: projectId,
        type: data.type,
        name: data.name ?? data.type,
        params: data.params ?? {},
        enabled: true,
        sort_order: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      addEffectLocal(data.clip_id, optimistic);
      return { tempId, clipId: data.clip_id };
    },

    onSuccess(serverEffect, data, context) {
      if (!context) return;
      removeEffectLocal(context.tempId);
      addEffectLocal(data.clip_id, serverEffect);

      historyPush({
        label: `Добавить эффект "${serverEffect.name}"`,
        undo: () => removeEffectLocal(serverEffect.id),
        redo: () => addEffectLocal(data.clip_id, serverEffect),
      });
    },

    onError(_err, _data, context) {
      if (context) removeEffectLocal(context.tempId);
    },

    onSettled() {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}

// ── Update Effect ─────────────────────────────────────────────────────────

export function useUpdateEffect(projectId: string) {
  const queryClient = useQueryClient();
  const updateEffectLocal = useEditorStore((s) => s.updateEffectLocal);
  const historyPush = useHistoryStore((s) => s.push);

  return useMutation({
    mutationFn: ({
      effectId,
      data,
    }: {
      effectId: string;
      data: UpdateEffectInput;
    }) => editorApi.updateEffect(projectId, effectId, data),

    onMutate({ effectId, data }) {
      // Мы не можем легко получить предыдущее значение из вложенных данных,
      // поэтому применяем обновление напрямую  
      updateEffectLocal(effectId, data as Partial<EditorEffect>);
      return { effectId };
    },

    onSuccess(serverEffect, { effectId }) {
      updateEffectLocal(effectId, serverEffect);
    },

    onError(_err, { effectId }) {
      // В случае ошибки — перезагружаем весь проект
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },

    onSettled() {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}

// ── Delete Effect ─────────────────────────────────────────────────────────

export function useDeleteEffect(projectId: string) {
  const queryClient = useQueryClient();
  const removeEffectLocal = useEditorStore((s) => s.removeEffectLocal);
  const historyPush = useHistoryStore((s) => s.push);

  return useMutation({
    mutationFn: (effectId: string) => editorApi.deleteEffect(projectId, effectId),

    onMutate(effectId) {
      // Удаляем оптимистично — восстановление через invalidation
      removeEffectLocal(effectId);
      return { effectId };
    },

    onError() {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },

    onSettled() {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}
