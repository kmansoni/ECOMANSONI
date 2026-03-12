/**
 * @file src/components/reels/ReelDoubleTapHeart.tsx
 * @description Анимация большого сердца при double-tap (Instagram-стиль).
 *
 * Сердце появляется в точке тапа, выполняет spring-анимацию (grow → shrink → fade)
 * и вызывает `onAnimationComplete` по завершении для сброса состояния в родителе.
 *
 * Технические решения:
 * - `AnimatePresence` с key={position.x + position.y} — каждый новый тап создаёт
 *   отдельный экземпляр анимации, что позволяет прерывать и перезапускать.
 * - `position: absolute` с `transform: translate(-50%, -50%)` — центрирование
 *   относительно точки тапа.
 * - `pointer-events: none` — сердце не перехватывает touch-события.
 */

import React, { memo, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart } from 'lucide-react';
import type { TapPosition } from '@/types/reels';
import { Haptics } from '@/lib/haptics';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReelDoubleTapHeartProps {
  /**
   * Координаты точки тапа относительно контейнера видео.
   * `null` означает что анимация не активна (сердце скрыто).
   */
  position: TapPosition | null;
  /** Callback по завершении анимации — родитель сбросит position в null */
  onAnimationComplete: () => void;
}

// ---------------------------------------------------------------------------
// Константы анимации
// ---------------------------------------------------------------------------

/**
 * Spring-параметры: stiffness 400, damping 15 создают эффект резины —
 * быстрый рост с небольшим перелётом (scale 1.2), затем усадка до 1.
 */
const HEART_SPRING = { type: 'spring', stiffness: 400, damping: 15 } as const;

/** Keyframes для scale: 0 → 1.2 → 1 → 0 */
const SCALE_KEYFRAMES = [0, 1.2, 1, 0];

/** Keyframes для opacity: 0 → 1 → 1 → 0 */
const OPACITY_KEYFRAMES = [0, 1, 1, 0];

/** Тайминг в секундах для каждого keyframe */
const KEYFRAME_TIMES = [0, 0.3, 0.6, 1];

/** Общая длительность анимации 800ms */
const DURATION_S = 0.8;

// ---------------------------------------------------------------------------
// Компонент
// ---------------------------------------------------------------------------

/**
 * `ReelDoubleTapHeart` — анимированное сердце при double-tap.
 *
 * Не хранит состояния — полностью управляется через props.
 * Сердце 80×80px, белое с drop-shadow, рендерится поверх видео.
 */
const ReelDoubleTapHeart = memo<ReelDoubleTapHeartProps>(
  ({ position, onAnimationComplete }) => {
    // Haptic feedback при double-tap лайке
    useEffect(() => {
      if (position !== null) {
        Haptics.doubleTap();
      }
    }, [position]);

    return (
      <AnimatePresence>
        {position !== null && (
          <motion.div
            key={`heart-${position.x}-${position.y}`}
            className="absolute z-20 pointer-events-none"
            style={{
              left: position.x,
              top: position.y,
              translateX: '-50%',
              translateY: '-50%',
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: SCALE_KEYFRAMES,
              opacity: OPACITY_KEYFRAMES,
            }}
            transition={{
              duration: DURATION_S,
              times: KEYFRAME_TIMES,
              scale: HEART_SPRING,
              opacity: { duration: DURATION_S, times: KEYFRAME_TIMES, ease: 'linear' },
            }}
            onAnimationComplete={onAnimationComplete}
            aria-hidden="true"
          >
            <Heart
              size={80}
              fill="white"
              stroke="white"
              strokeWidth={1}
              style={{
                filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.5))',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    );
  },
);

ReelDoubleTapHeart.displayName = 'ReelDoubleTapHeart';

export { ReelDoubleTapHeart };
export type { ReelDoubleTapHeartProps };
