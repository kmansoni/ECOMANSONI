/**
 * TimelineRuler.tsx — Линейка времени с Canvas 2D.
 * Масштабируемые метки, клик для перемещения playhead.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { useTimelineStore } from '../../stores/timeline-store';

interface TimelineRulerProps {
  width: number;
  scrollLeft: number;
}

function getTickInterval(zoomLevel: number): { major: number; minor: number; labelFormat: 'frames' | 'seconds' | 'minutes' } {
  if (zoomLevel >= 200) {
    return { major: 1000, minor: 100, labelFormat: 'frames' };
  }
  if (zoomLevel >= 100) {
    return { major: 1000, minor: 500, labelFormat: 'seconds' };
  }
  if (zoomLevel >= 50) {
    return { major: 5000, minor: 1000, labelFormat: 'seconds' };
  }
  return { major: 10000, minor: 5000, labelFormat: 'minutes' };
}

function formatRulerTime(ms: number, format: 'frames' | 'seconds' | 'minutes'): string {
  const totalSec = ms / 1000;
  if (format === 'minutes') {
    const min = Math.floor(totalSec / 60);
    const sec = Math.floor(totalSec % 60);
    return `${min}:${String(sec).padStart(2, '0')}`;
  }
  if (format === 'seconds') {
    return `${totalSec.toFixed(1)}s`;
  }
  return `${totalSec.toFixed(2)}s`;
}

export const TimelineRuler = React.memo(function TimelineRuler({
  width,
  scrollLeft,
}: TimelineRulerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoomLevel = useTimelineStore((s) => s.zoomLevel);
  const seek = useTimelineStore((s) => s.seek);

  const rulerHeight = 28;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = rulerHeight * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, rulerHeight);

    const pxPerMs = zoomLevel / 1000;
    const { major, minor, labelFormat } = getTickInterval(zoomLevel);

    const startMs = Math.max(0, Math.floor((scrollLeft / pxPerMs) / minor) * minor);
    const endMs = ((scrollLeft + width) / pxPerMs) + minor;

    // Draw minor ticks
    ctx.strokeStyle = '#4a4a6a';
    ctx.lineWidth = 1;
    for (let ms = startMs; ms <= endMs; ms += minor) {
      const x = ms * pxPerMs - scrollLeft;
      if (x < -1 || x > width + 1) continue;
      ctx.beginPath();
      ctx.moveTo(x, rulerHeight - 6);
      ctx.lineTo(x, rulerHeight);
      ctx.stroke();
    }

    // Draw major ticks + labels
    ctx.strokeStyle = '#9ca3af';
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = 1;

    for (let ms = startMs; ms <= endMs; ms += major) {
      const x = ms * pxPerMs - scrollLeft;
      if (x < -20 || x > width + 20) continue;

      ctx.beginPath();
      ctx.moveTo(x, rulerHeight - 14);
      ctx.lineTo(x, rulerHeight);
      ctx.stroke();

      const label = formatRulerTime(ms, labelFormat);
      ctx.fillText(label, x, rulerHeight - 16);
    }

    // Bottom line
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, rulerHeight - 0.5);
    ctx.lineTo(width, rulerHeight - 0.5);
    ctx.stroke();
  }, [width, scrollLeft, zoomLevel]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const relativeX = e.clientX - rect.left + scrollLeft;
      const pxPerMs = zoomLevel / 1000;
      const timeMs = Math.max(0, relativeX / pxPerMs);
      seek(timeMs);
    },
    [scrollLeft, zoomLevel, seek],
  );

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={rulerHeight}
      className="block cursor-pointer flex-shrink-0"
      style={{ width, height: rulerHeight }}
      onClick={handleClick}
      role="slider"
      aria-label="Линейка времени — нажмите для перемещения позиции"
      aria-valuenow={0}
    />
  );
});
