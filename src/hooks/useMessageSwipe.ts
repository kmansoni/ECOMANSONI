import { useRef, useCallback } from 'react';
import { useHapticFeedback } from './useHapticFeedback';

const SWIPE_THRESHOLD = 60;

export function useMessageSwipe(onReply: (messageId: string) => void) {
  const haptic = useHapticFeedback();
  const startX = useRef<number>(0);
  const startY = useRef<number>(0);
  const currentX = useRef<number>(0);
  const activated = useRef<Record<string, boolean>>({});
  const onTranslate = useRef<Record<string, ((x: number) => void)>>({});

  const bind = useCallback((messageId: string) => {
    const onTouchStart = (e: React.TouchEvent) => {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      currentX.current = startX.current;
      activated.current[messageId] = false;
    };

    const onTouchMove = (e: React.TouchEvent) => {
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;

      // Только горизонтальный свайп вправо
      if (Math.abs(dy) > Math.abs(dx) || dx < 0) {
        onTranslate.current[messageId]?.(0);
        return;
      }

      currentX.current = e.touches[0].clientX;
      const clamped = Math.min(dx, SWIPE_THRESHOLD * 1.5);
      onTranslate.current[messageId]?.(clamped);

      if (!activated.current[messageId] && dx >= SWIPE_THRESHOLD) {
        activated.current[messageId] = true;
        haptic.medium();
      }
    };

    const onTouchEnd = () => {
      const dx = currentX.current - startX.current;
      onTranslate.current[messageId]?.(0);
      if (dx >= SWIPE_THRESHOLD) {
        onReply(messageId);
      }
      activated.current[messageId] = false;
    };

    // Mouse support
    let mouseDown = false;
    const onMouseDown = (e: React.MouseEvent) => {
      mouseDown = true;
      startX.current = e.clientX;
      startY.current = e.clientY;
      currentX.current = startX.current;
      activated.current[messageId] = false;
    };

    const onMouseMove = (e: React.MouseEvent) => {
      if (!mouseDown) return;
      const dx = e.clientX - startX.current;
      if (dx < 0) {
        onTranslate.current[messageId]?.(0);
        return;
      }
      const clamped = Math.min(dx, SWIPE_THRESHOLD * 1.5);
      onTranslate.current[messageId]?.(clamped);
      if (!activated.current[messageId] && dx >= SWIPE_THRESHOLD) {
        activated.current[messageId] = true;
        haptic.medium();
      }
    };

    const onMouseUp = () => {
      if (!mouseDown) return;
      mouseDown = false;
      const dx = currentX.current - startX.current;
      onTranslate.current[messageId]?.(0);
      if (dx >= SWIPE_THRESHOLD) {
        onReply(messageId);
      }
      activated.current[messageId] = false;
    };

    const registerTranslate = (fn: (x: number) => void) => {
      onTranslate.current[messageId] = fn;
    };

    return {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onMouseDown,
      onMouseMove,
      onMouseUp,
      registerTranslate,
      threshold: SWIPE_THRESHOLD,
    };
  }, [onReply, haptic]);

  return { bind };
}
