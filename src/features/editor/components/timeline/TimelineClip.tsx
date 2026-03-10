/**
 * TimelineClip.tsx — Клип на дорожке.
 * Drag to move, resize handles, selected state, transition indicators.
 * Использует pointer events для производительности.
 */

import React, { useCallback, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useTimelineStore } from '../../stores/timeline-store';
import { useEditorStore } from '../../stores/editor-store';
import type { ClipWithDetails, ClipType, TrackType } from '../../types';
import { MIN_CLIP_DURATION_MS } from '../../constants';

interface TimelineClipProps {
  clip: ClipWithDetails;
  trackType: TrackType;
  pxPerMs: number;
  trackRef: React.RefObject<HTMLDivElement>;
  isSelected: boolean;
}

const CLIP_COLORS: Record<ClipType, string> = {
  video: '#4f46e5',
  audio: '#16a34a',
  image: '#4f46e5',
  text: '#eab308',
  sticker: '#ec4899',
  transition: '#a855f7',
  effect: '#8b5cf6',
};

const CLIP_HOVER_COLORS: Record<ClipType, string> = {
  video: '#5b52f0',
  audio: '#1db04e',
  image: '#5b52f0',
  text: '#f5c518',
  sticker: '#f05aa8',
  transition: '#b366f7',
  effect: '#9b6df7',
};

export const TimelineClip = React.memo(function TimelineClip({
  clip,
  trackType,
  pxPerMs,
  trackRef,
  isSelected,
}: TimelineClipProps) {
  const selectClip = useTimelineStore((s) => s.selectClip);
  const startDrag = useTimelineStore((s) => s.startDrag);
  const updateDrag = useTimelineStore((s) => s.updateDrag);
  const endDrag = useTimelineStore((s) => s.endDrag);
  const updateClipLocal = useEditorStore((s) => s.updateClipLocal);
  const getAllClipEdges = useEditorStore((s) => s.getAllClipEdges);
  const snapToGrid = useTimelineStore((s) => s.snapToGrid);

  const clipRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ startMs: number; pointerX: number } | null>(null);
  const resizeRef = useRef<{ side: 'left' | 'right'; pointerX: number; origStartMs: number; origDurationMs: number } | null>(null);

  const left = clip.start_ms * pxPerMs;
  const width = Math.max(clip.duration_ms * pxPerMs, 4);
  const bgColor = CLIP_COLORS[clip.type] ?? '#6b7280';
  const hoverColor = CLIP_HOVER_COLORS[clip.type] ?? '#8b8fa0';

  const displayName = useMemo(() => {
    if (clip.type === 'text' && clip.text_content) {
      return clip.text_content.slice(0, 30);
    }
    return clip.name;
  }, [clip.type, clip.text_content, clip.name]);

  // ── Click / Select ──────────────────────────────────────────────────
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      selectClip(clip.id, e.shiftKey || e.ctrlKey || e.metaKey);
    },
    [clip.id, selectClip],
  );

  // ── Drag to move ──────────────────────────────────────────────────
  const handleDragPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      if (resizeRef.current) return;

      dragStartRef.current = { startMs: clip.start_ms, pointerX: e.clientX };
      startDrag('clip-move', clip.start_ms);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [clip.start_ms, startDrag],
  );

  const handleDragPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current) return;

      const deltaX = e.clientX - dragStartRef.current.pointerX;
      const deltaMsRaw = deltaX / pxPerMs;
      const newStartMs = Math.max(0, dragStartRef.current.startMs + deltaMsRaw);
      const edges = getAllClipEdges();
      const snapped = snapToGrid(newStartMs, edges);

      updateDrag(snapped);
      updateClipLocal(clip.id, { start_ms: snapped });
    },
    [pxPerMs, getAllClipEdges, snapToGrid, updateDrag, updateClipLocal, clip.id],
  );

  const handleDragPointerUp = useCallback(() => {
    dragStartRef.current = null;
    endDrag();
  }, [endDrag]);

  // ── Resize left handle ──────────────────────────────────────────────
  const handleResizeLeftDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      resizeRef.current = {
        side: 'left',
        pointerX: e.clientX,
        origStartMs: clip.start_ms,
        origDurationMs: clip.duration_ms,
      };
      startDrag('clip-resize-left', clip.start_ms);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [clip.start_ms, clip.duration_ms, startDrag],
  );

  const handleResizeLeftMove = useCallback(
    (e: React.PointerEvent) => {
      if (!resizeRef.current || resizeRef.current.side !== 'left') return;

      const deltaX = e.clientX - resizeRef.current.pointerX;
      const deltaMs = deltaX / pxPerMs;
      const maxDeltaMs = resizeRef.current.origDurationMs - MIN_CLIP_DURATION_MS;

      const clampedDelta = Math.max(-resizeRef.current.origStartMs, Math.min(maxDeltaMs, deltaMs));
      const newStartMs = resizeRef.current.origStartMs + clampedDelta;
      const newDurationMs = resizeRef.current.origDurationMs - clampedDelta;

      updateClipLocal(clip.id, {
        start_ms: newStartMs,
        duration_ms: newDurationMs,
        source_start_ms: clip.source_start_ms + clampedDelta,
      });
    },
    [pxPerMs, updateClipLocal, clip.id, clip.source_start_ms],
  );

  const handleResizeLeftUp = useCallback(() => {
    resizeRef.current = null;
    endDrag();
  }, [endDrag]);

  // ── Resize right handle ──────────────────────────────────────────────
  const handleResizeRightDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      resizeRef.current = {
        side: 'right',
        pointerX: e.clientX,
        origStartMs: clip.start_ms,
        origDurationMs: clip.duration_ms,
      };
      startDrag('clip-resize-right', clip.start_ms + clip.duration_ms);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [clip.start_ms, clip.duration_ms, startDrag],
  );

  const handleResizeRightMove = useCallback(
    (e: React.PointerEvent) => {
      if (!resizeRef.current || resizeRef.current.side !== 'right') return;

      const deltaX = e.clientX - resizeRef.current.pointerX;
      const deltaMs = deltaX / pxPerMs;
      const newDurationMs = Math.max(MIN_CLIP_DURATION_MS, resizeRef.current.origDurationMs + deltaMs);

      updateClipLocal(clip.id, { duration_ms: newDurationMs });
    },
    [pxPerMs, updateClipLocal, clip.id],
  );

  const handleResizeRightUp = useCallback(() => {
    resizeRef.current = null;
    endDrag();
  }, [endDrag]);

  return (
    <motion.div
      ref={clipRef}
      className={cn(
        'absolute top-1 bottom-1 rounded-md overflow-hidden select-none group',
        isSelected ? 'ring-2 ring-white/80 z-20' : 'z-10',
      )}
      style={{
        left: `${left}px`,
        width: `${width}px`,
        backgroundColor: bgColor,
      }}
      whileHover={{ backgroundColor: hoverColor }}
      onClick={handleClick}
      onPointerDown={handleDragPointerDown}
      onPointerMove={handleDragPointerMove}
      onPointerUp={handleDragPointerUp}
      role="button"
      aria-label={`Клип: ${displayName}`}
      aria-selected={isSelected}
      tabIndex={0}
    >
      {/* Left resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/30 z-30 transition-colors"
        onPointerDown={handleResizeLeftDown}
        onPointerMove={handleResizeLeftMove}
        onPointerUp={handleResizeLeftUp}
        aria-label="Изменить начало клипа"
      />

      {/* Content */}
      <div className="px-2 py-0.5 text-[10px] text-white truncate cursor-move flex items-center h-full">
        {displayName}
      </div>

      {/* Transition in indicator */}
      {clip.transition_in && (
        <div
          className="absolute left-0 top-0 w-0 h-0"
          style={{
            borderLeft: '8px solid #eab308',
            borderBottom: '8px solid transparent',
          }}
          title={`Transition in: ${clip.transition_in.type}`}
        />
      )}

      {/* Transition out indicator */}
      {clip.transition_out && (
        <div
          className="absolute right-0 top-0 w-0 h-0"
          style={{
            borderRight: '8px solid #eab308',
            borderBottom: '8px solid transparent',
          }}
          title={`Transition out: ${clip.transition_out.type}`}
        />
      )}

      {/* Right resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/30 z-30 transition-colors"
        onPointerDown={handleResizeRightDown}
        onPointerMove={handleResizeRightMove}
        onPointerUp={handleResizeRightUp}
        aria-label="Изменить конец клипа"
      />

      {/* Selection highlight bottom bar */}
      {isSelected && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/60" />
      )}
    </motion.div>
  );
});
