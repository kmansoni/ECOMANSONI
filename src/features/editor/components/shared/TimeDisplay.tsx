/**
 * TimeDisplay.tsx — Отображение времени в формате HH:MM:SS.mmm или MM:SS:ff.
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface TimeDisplayProps {
  timeMs: number;
  fps?: number;
  className?: string;
}

function formatTimeCode(timeMs: number, fps?: number): string {
  const totalMs = Math.max(0, Math.round(timeMs));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1_000);
  const ms = totalMs % 1_000;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  if (fps && fps > 0) {
    const frames = Math.floor((ms / 1_000) * fps);
    const ff = String(frames).padStart(2, '0');
    return hours > 0 ? `${hh}:${mm}:${ss}:${ff}` : `${mm}:${ss}:${ff}`;
  }

  const mmm = String(ms).padStart(3, '0');
  return hours > 0 ? `${hh}:${mm}:${ss}.${mmm}` : `${mm}:${ss}.${mmm}`;
}

export const TimeDisplay = React.memo(function TimeDisplay({
  timeMs,
  fps,
  className,
}: TimeDisplayProps) {
  const formatted = useMemo(() => formatTimeCode(timeMs, fps), [timeMs, fps]);

  return (
    <span
      className={cn('font-mono text-sm tabular-nums text-slate-300', className)}
      aria-label={`Время: ${formatted}`}
    >
      {formatted}
    </span>
  );
});

export { formatTimeCode };
