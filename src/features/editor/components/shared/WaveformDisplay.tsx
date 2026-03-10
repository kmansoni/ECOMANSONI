/**
 * WaveformDisplay.tsx — SVG отображение аудио waveform.
 * Рисует bars через SVG <rect> с адаптивной шириной.
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

export interface WaveformDisplayProps {
  amplitudes: number[];
  width?: number;
  height?: number;
  color?: string;
  backgroundColor?: string;
  className?: string;
}

export const WaveformDisplay = React.memo(function WaveformDisplay({
  amplitudes,
  width = 200,
  height = 40,
  color = '#22c55e',
  backgroundColor = 'transparent',
  className,
}: WaveformDisplayProps) {
  const bars = useMemo(() => {
    if (amplitudes.length === 0) return [];

    const barCount = Math.min(amplitudes.length, Math.floor(width / 3));
    const samplesPerBar = Math.max(1, Math.floor(amplitudes.length / barCount));
    const barWidth = Math.max(1, (width / barCount) * 0.7);
    const gap = (width / barCount) * 0.3;

    const result: Array<{ x: number; y: number; w: number; h: number }> = [];

    for (let i = 0; i < barCount; i++) {
      const startSample = i * samplesPerBar;
      const endSample = Math.min(startSample + samplesPerBar, amplitudes.length);

      let maxAmplitude = 0;
      for (let j = startSample; j < endSample; j++) {
        const amp = Math.abs(amplitudes[j]);
        if (amp > maxAmplitude) maxAmplitude = amp;
      }

      const normalizedHeight = Math.max(2, maxAmplitude * (height - 4));
      const x = i * (barWidth + gap);
      const y = (height - normalizedHeight) / 2;

      result.push({ x, y, w: barWidth, h: normalizedHeight });
    }

    return result;
  }, [amplitudes, width, height]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className={cn('block', className)}
      aria-label="Аудио волна"
      role="img"
    >
      <rect width={width} height={height} fill={backgroundColor} />
      {bars.map((bar, i) => (
        <rect
          key={i}
          x={bar.x}
          y={bar.y}
          width={bar.w}
          height={bar.h}
          rx={1}
          fill={color}
          opacity={0.8}
        />
      ))}
    </svg>
  );
});
