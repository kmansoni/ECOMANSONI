/**
 * timeline-store.ts — Zustand store состояния таймлайна.
 *
 * Управляет playback, zoom, selection, drag и snap.
 * Полностью отделён от основного editor-store для минимизации ререндеров.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  DEFAULT_ZOOM_LEVEL,
  DEFAULT_SNAP_THRESHOLD_MS,
  ZOOM_LEVELS,
  MIN_ZOOM,
  MAX_ZOOM,
} from '../constants';

// ── Types ─────────────────────────────────────────────────────────────────

export type DragType =
  | 'clip-move'
  | 'clip-resize-left'
  | 'clip-resize-right'
  | 'clip-split'
  | null;

export interface TimelineState {
  // Playback
  isPlaying: boolean;
  currentTimeMs: number;
  playbackRate: number;

  // Viewport
  zoomLevel: number; // пикcелей на секунду
  scrollLeft: number;
  scrollTop: number;

  // Selection
  selectedClipIds: Set<string>;
  selectedTrackId: string | null;
  selectedKeyframeIds: Set<string>;

  // Drag state
  isDragging: boolean;
  dragType: DragType;
  dragStartMs: number;
  dragCurrentMs: number;

  // Snap
  snapEnabled: boolean;
  snapThresholdMs: number;

  // ── Playback actions ──────────────────────────────────────────────────
  play(): void;
  pause(): void;
  togglePlayback(): void;
  seek(timeMs: number): void;
  setPlaybackRate(rate: number): void;

  // ── Viewport actions ──────────────────────────────────────────────────
  zoomIn(): void;
  zoomOut(): void;
  zoomToFit(projectDurationMs: number): void;
  setZoomLevel(level: number): void;
  setScroll(left: number, top: number): void;

  // ── Selection actions ─────────────────────────────────────────────────
  selectClip(clipId: string, addToSelection?: boolean): void;
  deselectClip(clipId: string): void;
  clearSelection(): void;
  selectMultipleClips(clipIds: string[]): void;
  selectTrack(trackId: string | null): void;
  selectKeyframe(keyframeId: string, addToSelection?: boolean): void;
  deselectKeyframe(keyframeId: string): void;
  clearKeyframeSelection(): void;

  // ── Drag actions ──────────────────────────────────────────────────────
  startDrag(type: DragType, startMs: number): void;
  updateDrag(currentMs: number): void;
  endDrag(): void;

  // ── Snap actions ──────────────────────────────────────────────────────
  toggleSnap(): void;
  setSnapThreshold(ms: number): void;

  // ── Helpers ───────────────────────────────────────────────────────────
  msToPixels(ms: number): number;
  pixelsToMs(px: number): number;
  snapToGrid(ms: number, clipEdges: number[]): number;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function findNextZoom(current: number, direction: 1 | -1): number {
  const levels = [...ZOOM_LEVELS];
  if (direction === 1) {
    for (const level of levels) {
      if (level > current) return level;
    }
    return MAX_ZOOM;
  }
  for (let i = levels.length - 1; i >= 0; i--) {
    if (levels[i] < current) return levels[i];
  }
  return MIN_ZOOM;
}

// ── Store ─────────────────────────────────────────────────────────────────

export const useTimelineStore = create<TimelineState>()(
  subscribeWithSelector((set, get) => ({
    // Playback defaults
    isPlaying: false,
    currentTimeMs: 0,
    playbackRate: 1,

    // Viewport defaults
    zoomLevel: DEFAULT_ZOOM_LEVEL,
    scrollLeft: 0,
    scrollTop: 0,

    // Selection defaults
    selectedClipIds: new Set<string>(),
    selectedTrackId: null,
    selectedKeyframeIds: new Set<string>(),

    // Drag defaults
    isDragging: false,
    dragType: null,
    dragStartMs: 0,
    dragCurrentMs: 0,

    // Snap defaults
    snapEnabled: true,
    snapThresholdMs: DEFAULT_SNAP_THRESHOLD_MS,

    // ── Playback ────────────────────────────────────────────────────────

    play() {
      set({ isPlaying: true });
    },

    pause() {
      set({ isPlaying: false });
    },

    togglePlayback() {
      set((s) => ({ isPlaying: !s.isPlaying }));
    },

    seek(timeMs) {
      set({ currentTimeMs: Math.max(0, timeMs) });
    },

    setPlaybackRate(rate) {
      set({ playbackRate: Math.max(0.25, Math.min(4, rate)) });
    },

    // ── Viewport ────────────────────────────────────────────────────────

    zoomIn() {
      set((s) => ({ zoomLevel: findNextZoom(s.zoomLevel, 1) }));
    },

    zoomOut() {
      set((s) => ({ zoomLevel: findNextZoom(s.zoomLevel, -1) }));
    },

    zoomToFit(projectDurationMs) {
      if (projectDurationMs <= 0) return;
      // Рассчитываем zoom так, чтобы весь проект поместился в ~90% ширины viewport.
      // Предположим, что viewport ~1200px — реальное значение будет устанавливаться из компонента.
      const viewportWidth = 1200;
      const durationSec = projectDurationMs / 1000;
      const idealZoom = (viewportWidth * 0.9) / durationSec;
      const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(idealZoom)));
      set({ zoomLevel: clamped, scrollLeft: 0 });
    },

    setZoomLevel(level) {
      set({ zoomLevel: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level)) });
    },

    setScroll(left, top) {
      set({ scrollLeft: Math.max(0, left), scrollTop: Math.max(0, top) });
    },

    // ── Selection ───────────────────────────────────────────────────────

    selectClip(clipId, addToSelection = false) {
      set((s) => {
        const next = addToSelection ? new Set(s.selectedClipIds) : new Set<string>();
        next.add(clipId);
        return { selectedClipIds: next };
      });
    },

    deselectClip(clipId) {
      set((s) => {
        const next = new Set(s.selectedClipIds);
        next.delete(clipId);
        return { selectedClipIds: next };
      });
    },

    clearSelection() {
      set({
        selectedClipIds: new Set<string>(),
        selectedTrackId: null,
        selectedKeyframeIds: new Set<string>(),
      });
    },

    selectMultipleClips(clipIds) {
      set({ selectedClipIds: new Set(clipIds) });
    },

    selectTrack(trackId) {
      set({ selectedTrackId: trackId });
    },

    selectKeyframe(keyframeId, addToSelection = false) {
      set((s) => {
        const next = addToSelection
          ? new Set(s.selectedKeyframeIds)
          : new Set<string>();
        next.add(keyframeId);
        return { selectedKeyframeIds: next };
      });
    },

    deselectKeyframe(keyframeId) {
      set((s) => {
        const next = new Set(s.selectedKeyframeIds);
        next.delete(keyframeId);
        return { selectedKeyframeIds: next };
      });
    },

    clearKeyframeSelection() {
      set({ selectedKeyframeIds: new Set<string>() });
    },

    // ── Drag ────────────────────────────────────────────────────────────

    startDrag(type, startMs) {
      set({ isDragging: true, dragType: type, dragStartMs: startMs, dragCurrentMs: startMs });
    },

    updateDrag(currentMs) {
      set({ dragCurrentMs: currentMs });
    },

    endDrag() {
      set({ isDragging: false, dragType: null, dragStartMs: 0, dragCurrentMs: 0 });
    },

    // ── Snap ────────────────────────────────────────────────────────────

    toggleSnap() {
      set((s) => ({ snapEnabled: !s.snapEnabled }));
    },

    setSnapThreshold(ms) {
      set({ snapThresholdMs: Math.max(10, Math.min(500, ms)) });
    },

    // ── Helpers ─────────────────────────────────────────────────────────

    msToPixels(ms) {
      return (ms / 1000) * get().zoomLevel;
    },

    pixelsToMs(px) {
      const zoom = get().zoomLevel;
      if (zoom === 0) return 0;
      return (px / zoom) * 1000;
    },

    snapToGrid(ms, clipEdges) {
      const { snapEnabled, snapThresholdMs } = get();
      if (!snapEnabled || clipEdges.length === 0) return ms;

      let closest = ms;
      let minDist = Infinity;

      for (const edge of clipEdges) {
        const dist = Math.abs(ms - edge);
        if (dist < minDist && dist <= snapThresholdMs) {
          minDist = dist;
          closest = edge;
        }
      }

      return closest;
    },
  })),
);
