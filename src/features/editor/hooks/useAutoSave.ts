/**
 * useAutoSave.ts — Автосохранение проекта через debounce (2 сек).
 *
 * Подписывается на изменения editor-store через subscribeWithSelector.
 * При каждом изменении isDirty → true, через 2с сохраняет на сервер через PATCH.
 * Предотвращает race conditions: если запрос уже в полёте, новый не отправляется,
 * но ставится флаг "нужно повторить после завершения текущего".
 */

import { useEffect, useRef, useCallback } from 'react';
import { useEditorStore } from '../stores/editor-store';
import { editorApi } from '../api';
import { AUTO_SAVE_DEBOUNCE_MS } from '../constants';
import { logger } from '@/lib/logger';

export function useAutoSave(projectId: string | undefined) {
  const isSavingRef = useRef(false);
  const needsRetryRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSave = useCallback(async () => {
    if (!projectId) return;
    const { project, isDirty, markClean } = useEditorStore.getState();
    if (!project || !isDirty) return;

    if (isSavingRef.current) {
      needsRetryRef.current = true;
      return;
    }

    isSavingRef.current = true;
    try {
      await editorApi.updateProject(projectId, {
        title: project.title,
        description: project.description ?? undefined,
        settings: project.settings,
        duration_ms: useEditorStore.getState().getProjectDuration(),
      } as Parameters<typeof editorApi.updateProject>[1]);
      markClean();
    } catch (err) {
      // При ошибке сети не сбрасываем isDirty — повторим при следующем изменении
      logger.warn('[AutoSave] Save failed, will retry', { error: err });
    } finally {
      isSavingRef.current = false;
      if (needsRetryRef.current) {
        needsRetryRef.current = false;
        doSave();
      }
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;

    const unsub = useEditorStore.subscribe(
      (state) => state.isDirty,
      (isDirty) => {
        if (!isDirty) return;

        // Очистить предыдущий таймер
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }

        timerRef.current = setTimeout(() => {
          doSave();
        }, AUTO_SAVE_DEBOUNCE_MS);
      },
    );

    return () => {
      unsub();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [projectId, doSave]);

  // При размонтировании — немедленное сохранение если есть несохранённые данные
  useEffect(() => {
    return () => {
      const { isDirty } = useEditorStore.getState();
      if (isDirty && projectId) {
        // fire-and-forget
        doSave();
      }
    };
  }, [projectId, doSave]);

  return {
    isSaving: isSavingRef.current,
    saveNow: doSave,
  };
}
