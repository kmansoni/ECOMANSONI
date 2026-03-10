/**
 * TimelinePlayhead.tsx — Красная вертикальная линия текущего времени.
 * Draggable для seek. Z-index выше всех клипов.
 */

import React, { useCallback, useRef } from 'react';
import { useTimelineStore } from '../../stores/timeline-store';

interface TimelinePlayheadProps {
  containerWidth: number;
}

export const TimelinePlayhead = React.memo(function TimelinePlayhead({
  containerWidth,
}: TimelinePlayheadProps) {
  const currentTimeMs = useTimelineStore((s) => s.currentTimeMs);
  const zoomLevel = useTimelineStore((s) => s.zoomLevel);
  const seek = useTimelineStore((s) => s.seek);
  const isDraggingRef = useRef(false);

  const pxPerMs = zoomLevel / 1000;
  const positionX = currentTimeMs * pxPerMs;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isDraggingRef.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return;
      const rect = (e.currentTarget as HTMLElement).parentElement?.getBoundingClientRect();
      if (!rect) return;
      const relativeX = e.clientX - rect.left;
      const timeMs = Math.max(0, relativeX / pxPerMs);
      seek(timeMs);
    },
    [pxPerMs, seek],
  );

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  if (positionX < 0 || positionX > containerWidth) return null;

  return (
    <div
      className="absolute top-0 bottom-0 z-50 pointer-events-none"
      style={{ left: `${positionX}px` }}
      aria-label={`Указатель воспроизведения`}
    >
      {/* Triangle handle at top */}
      <div
        className="absolute -top-1 -left-[5px] w-0 h-0 pointer-events-auto cursor-col-resize"
        style={{
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: '8px solid #ef4444',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        role="slider"
        aria-label="Перетащите для изменения позиции воспроизведения"
        aria-valuenow={Math.round(currentTimeMs)}
        tabIndex={0}
      />
      {/* Vertical line */}
      <div className="w-px h-full bg-red-500" />
    </div>
  );
});
