/**
 * @file src/components/reels/ReelProgressBar.tsx
 * @description Тонкая полоска прогресса воспроизведения Reel (2px высотой).
 *
 * Рендерит белую полосу с 80% opacity поверх чёрного фона.
 * Обновление — CSS transition; значение вычисляется снаружи через RAF.
 * При duration === 0 — не рендерится (SSR-safety, предотвращает деление на 0).
 */

import React, { memo } from 'react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReelProgressBarProps {
  /** Текущее время воспроизведения в секундах */
  currentTime: number;
  /** Общая длительность видео в секундах */
  duration: number;
  /** Дополнительные CSS классы для контейнера */
  className?: string;
}

// ---------------------------------------------------------------------------
// Компонент
// ---------------------------------------------------------------------------

/**
 * `ReelProgressBar` — прогресс-бар воспроизведения одного Reel.
 *
 * Архитектурные решения:
 * - Не хранит внутреннего состояния; реагирует только на входящие props.
 * - Ширина задаётся через `width` inline style (CSS transition для плавности).
 * - `will-change: width` — подсказка браузеру для compositing.
 * - duration === 0 защищает от деления на 0 и артефактов при SSR.
 */
const ReelProgressBar = memo<ReelProgressBarProps>(
  ({ currentTime, duration, className }) => {
    // Защита от SSR и невалидных состояний
    if (duration <= 0) return null;

    const progressPercent = Math.min(100, Math.max(0, (currentTime / duration) * 100));

    return (
      <div
        className={cn('absolute bottom-0 left-0 right-0 h-[2px] bg-white/20 z-10', className)}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progressPercent)}
        aria-label="Прогресс воспроизведения"
      >
        <div
          className="h-full bg-white/80 origin-left"
          style={{
            width: `${progressPercent}%`,
            transition: 'width 0.1s linear',
            willChange: 'width',
          }}
        />
      </div>
    );
  },
);

ReelProgressBar.displayName = 'ReelProgressBar';

export { ReelProgressBar };
export type { ReelProgressBarProps };
