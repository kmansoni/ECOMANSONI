/**
 * useKeyboardShortcuts.ts — Горячие клавиши редактора.
 *
 * Перехватывает события keydown на window.
 * Игнорирует ввод, когда фокус внутри <input>, <textarea>, contentEditable.
 * Предотвращает default browser actions для занятых комбинаций (Ctrl+S, Space, etc).
 */

import { useEffect, useCallback } from 'react';
import { useTimelineStore } from '../stores/timeline-store';
import { useEditorStore } from '../stores/editor-store';
import { useHistoryStore } from '../stores/history-store';
import { useAutoSave } from './useAutoSave';
import { SEEK_STEP_MS, SEEK_STEP_LARGE_MS } from '../constants';

interface ShortcutDeps {
  projectId: string | undefined;
  onDeleteClips?: (clipIds: string[]) => void;
  onSplitClip?: (clipId: string, timeMs: number) => void;
  onDuplicateClips?: (clipIds: string[]) => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts(deps: ShortcutDeps) {
  const { projectId, onDeleteClips, onSplitClip, onDuplicateClips } = deps;
  const { saveNow } = useAutoSave(projectId);

  const handler = useCallback(
    (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const key = e.key;

      // ── Playback ────────────────────────────────────────────────────
      if (key === ' ') {
        e.preventDefault();
        useTimelineStore.getState().togglePlayback();
        return;
      }

      // ── Undo / Redo ─────────────────────────────────────────────────
      if (ctrl && !shift && key === 'z') {
        e.preventDefault();
        useHistoryStore.getState().undo();
        return;
      }
      if (ctrl && shift && (key === 'z' || key === 'Z')) {
        e.preventDefault();
        useHistoryStore.getState().redo();
        return;
      }

      // ── Save ────────────────────────────────────────────────────────
      if (ctrl && key === 's') {
        e.preventDefault();
        saveNow();
        return;
      }

      // ── Delete selected clips ───────────────────────────────────────
      if (key === 'Delete' || key === 'Backspace') {
        e.preventDefault();
        const selected = Array.from(useTimelineStore.getState().selectedClipIds);
        if (selected.length > 0 && onDeleteClips) {
          onDeleteClips(selected);
        }
        return;
      }

      // ── Duplicate ───────────────────────────────────────────────────
      if (ctrl && key === 'd') {
        e.preventDefault();
        const selected = Array.from(useTimelineStore.getState().selectedClipIds);
        if (selected.length > 0 && onDuplicateClips) {
          onDuplicateClips(selected);
        }
        return;
      }

      // ── Split clip at playhead ──────────────────────────────────────
      if (key === 'b' || key === 'B') {
        e.preventDefault();
        const { selectedClipIds, currentTimeMs } = useTimelineStore.getState();
        const clipIds = Array.from(selectedClipIds);
        if (clipIds.length === 1 && onSplitClip) {
          onSplitClip(clipIds[0], currentTimeMs);
        }
        return;
      }

      // ── Zoom ────────────────────────────────────────────────────────
      if (key === '=' || key === '+') {
        e.preventDefault();
        useTimelineStore.getState().zoomIn();
        return;
      }
      if (key === '-') {
        e.preventDefault();
        useTimelineStore.getState().zoomOut();
        return;
      }
      if (ctrl && key === '0') {
        e.preventDefault();
        const duration = useEditorStore.getState().getProjectDuration();
        useTimelineStore.getState().zoomToFit(duration);
        return;
      }

      // ── Deselect ────────────────────────────────────────────────────
      if (key === 'Escape') {
        useTimelineStore.getState().clearSelection();
        return;
      }

      // ── Seek ────────────────────────────────────────────────────────
      if (key === 'ArrowLeft') {
        e.preventDefault();
        const step = shift ? SEEK_STEP_LARGE_MS : SEEK_STEP_MS;
        const curr = useTimelineStore.getState().currentTimeMs;
        useTimelineStore.getState().seek(Math.max(0, curr - step));
        return;
      }
      if (key === 'ArrowRight') {
        e.preventDefault();
        const step = shift ? SEEK_STEP_LARGE_MS : SEEK_STEP_MS;
        const curr = useTimelineStore.getState().currentTimeMs;
        const max = useEditorStore.getState().getProjectDuration();
        useTimelineStore.getState().seek(Math.min(max, curr + step));
        return;
      }

      // ── Select All ──────────────────────────────────────────────────
      if (ctrl && key === 'a') {
        e.preventDefault();
        const allClipIds: string[] = [];
        for (const track of useEditorStore.getState().tracks) {
          for (const clip of track.clips) {
            allClipIds.push(clip.id);
          }
        }
        useTimelineStore.getState().selectMultipleClips(allClipIds);
        return;
      }
    },
    [saveNow, onDeleteClips, onSplitClip, onDuplicateClips],
  );

  useEffect(() => {
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handler]);
}
