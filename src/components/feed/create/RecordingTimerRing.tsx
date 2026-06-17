import { cn } from '@/lib/utils';

interface RecordingTimerRingProps {
  elapsedMs: number;
  maxMs: number;
}

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function RecordingTimerRing({ elapsedMs, maxMs }: RecordingTimerRingProps) {
  const progress = maxMs > 0 ? elapsedMs / maxMs : 0;
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);
  const strokeColor =
    progress < 0.5 ? '#22c55e' :
    progress < 0.75 ? '#eab308' :
    '#ef4444';

  const elapsedSec = Math.floor(elapsedMs / 1000);
  const elapsedMin = Math.floor(elapsedSec / 60);
  const elapsedRemSec = elapsedSec % 60;

  const maxMin = maxMs >= 60_000 ? `${maxMs / 60_000}м` : `${maxMs / 1000}с`;

  return (
    <div className="relative flex items-center justify-center">
      <svg className="w-[88px] h-[88px] -rotate-90" viewBox="0 0 88 88">
        <circle
          cx="44"
          cy="44"
          r={RADIUS}
          fill="none"
          stroke="white/20"
          strokeWidth="4"
        />
        <circle
          cx="44"
          cy="44"
          r={RADIUS}
          fill="none"
          stroke={strokeColor}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-200"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[10px] font-bold text-white/80">
          {elapsedMin}:{String(elapsedRemSec).padStart(2, '0')}
        </span>
        <span className="text-[9px] text-white/50">/ {maxMin}</span>
      </div>
    </div>
  );
}
