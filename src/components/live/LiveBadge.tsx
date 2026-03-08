import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface LiveBadgeProps {
  /** Visual size variant. */
  size?: 'small' | 'large';
  /** Show duration timer next to the badge. */
  startedAt?: string | null;
  className?: string;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Red pulsing LIVE badge with optional duration timer.
 * size="large" — used on the stream page overlay
 * size="small" — used in StreamCard and lists
 */
export const LiveBadge = React.memo(function LiveBadge({
  size = 'large',
  startedAt,
  className,
}: LiveBadgeProps) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!startedAt) {
      setElapsed(0);
      return;
    }
    const start = new Date(startedAt).getTime();

    const tick = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    };
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startedAt]);

  const isSmall = size === 'small';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm font-bold tracking-wide uppercase',
        isSmall
          ? 'px-1.5 py-0.5 text-[10px]'
          : 'px-2 py-1 text-xs',
        'bg-red-600 text-white',
        className,
      )}
      aria-label="Live stream"
    >
      {/* Pulsing dot */}
      <span
        className={cn(
          'rounded-full bg-white animate-pulse',
          isSmall ? 'w-1 h-1' : 'w-1.5 h-1.5',
        )}
        aria-hidden="true"
      />
      LIVE
      {startedAt && !isSmall && (
        <span className="ml-1 font-mono font-normal normal-case tracking-normal opacity-90">
          {formatDuration(elapsed)}
        </span>
      )}
    </span>
  );
});
