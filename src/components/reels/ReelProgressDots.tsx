/**
 * @file src/components/reels/ReelProgressDots.tsx
 * @description Точки прогресса для навигации по нескольким Reel/сегментам.
 * Показывает текущую позицию в контексте всего фида.
 */

import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReelProgressDotsProps {
  /** Общее количество Reel в фиде */
  total: number;
  /** Текущий активный индекс */
  currentIndex: number;
  /** Массив индексов Reel, которые были полностью просмотрены */
  viewedIndices: number[];
  /** Callback при клике на точку */
  onDotClick?: (index: number) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const ReelProgressDots = memo<ReelProgressDotsProps>(({
  total,
  currentIndex,
  viewedIndices,
  onDotClick,
  className,
}) => {
  // Ограничиваем отображение максимум 30 точками для производительности
  const maxDots = 30;
  const step = Math.max(1, Math.ceil(total / maxDots));
  const dots = Array.from({ length: Math.min(total, maxDots) }, (_, i) => i * step);

  return (
    <div className={cn(
      'absolute top-3 left-1/2 -translate-x-1/2 z-30',
      'flex items-center gap-1.5',
      className,
    )}>
      {dots.map((idx) => {
        const isCurrent = idx === currentIndex;
        const isViewed = viewedIndices.includes(idx);
        const isFuture = idx > currentIndex && !isViewed;

        return (
          <motion.button
            key={idx}
            type="button"
            onClick={() => onDotClick?.(idx)}
            className={cn(
              'h-[3px] rounded-full transition-all duration-300 cursor-pointer',
              'hover:brightness-125',
              isCurrent
                ? 'bg-white w-6'
                : isViewed
                  ? 'bg-white/40 w-2'
                  : isFuture
                    ? 'bg-white/10 w-2'
                    : 'bg-white/20 w-2',
            )}
            animate={{
              width: isCurrent ? 24 : 8,
              opacity: isFuture ? 0.3 : 1,
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            aria-label={`Reel ${idx + 1} из ${total}`}
            aria-current={isCurrent ? 'true' : undefined}
          />
        );
      })}

      {/* Невидимый spacer для оставшихся точек (хвост пагинации) */}
      {total > maxDots && (
        <span className="text-white/20 text-[8px] ml-1 select-none">
          +{total - dots.length}
        </span>
      )}
    </div>
  );
});

ReelProgressDots.displayName = 'ReelProgressDots';

export { ReelProgressDots };
export type { ReelProgressDotsProps };