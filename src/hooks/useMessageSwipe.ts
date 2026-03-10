/**
 * useMessageSwipe — bidirectional message swipe gesture hook.
 *
 * RIGHT swipe → reply (Telegram/WhatsApp style).
 * LEFT  swipe → forward or delete action sheet.
 *
 * Features:
 *   - Diagonal detection: only activates if horizontal movement dominates.
 *   - Per-messageId translate callback via `registerTranslate()`.
 *   - Haptic feedback at threshold.
 *   - Mouse support for desktop.
 *   - Clamped translate (max 1.5× threshold).
 */

import { useRef, useCallback } from 'react';
import { useHapticFeedback } from './useHapticFeedback';

const SWIPE_THRESHOLD = 60;

export interface MessageSwipeCallbacks {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  registerTranslate: (fn: (x: number) => void) => void;
  threshold: number;
}

export function useMessageSwipe(
  onReply: (messageId: string) => void,
  onLeft?: (messageId: string) => void,
) {
  const haptic = useHapticFeedback();
  const startX = useRef<number>(0);
  const startY = useRef<number>(0);
  const currentX = useRef<number>(0);
  // direction locked per gesture: 'right' | 'left' | null
  const directionLock = useRef<Record<string, 'right' | 'left' | null>>({});
  const activated = useRef<Record<string, boolean>>({});
  const onTranslate = useRef<Record<string, ((x: number) => void)>>({});

  const bind = useCallback((messageId: string): MessageSwipeCallbacks => {
    const DIRECTION_LOCK_THRESHOLD = 10; // px before direction is committed

    const onTouchStart = (e: React.TouchEvent) => {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      currentX.current = startX.current;
      activated.current[messageId] = false;
      directionLock.current[messageId] = null;
    };

    const onTouchMove = (e: React.TouchEvent) => {
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;

      // If vertical movement dominates → abort swipe
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > DIRECTION_LOCK_THRESHOLD) {
        onTranslate.current[messageId]?.(0);
        directionLock.current[messageId] = null;
        return;
      }

      // Lock direction after DIRECTION_LOCK_THRESHOLD px of horizontal movement
      if (directionLock.current[messageId] === null) {
        if (Math.abs(dx) < DIRECTION_LOCK_THRESHOLD) return; // not committed yet
        directionLock.current[messageId] = dx > 0 ? 'right' : 'left';
      }

      currentX.current = e.touches[0].clientX;

      if (directionLock.current[messageId] === 'right') {
        // Right swipe → reply
        const clamped = Math.min(dx, SWIPE_THRESHOLD * 1.5);
        onTranslate.current[messageId]?.(clamped);

        if (!activated.current[messageId] && dx >= SWIPE_THRESHOLD) {
          activated.current[messageId] = true;
          haptic.medium();
        }
      } else if (directionLock.current[messageId] === 'left' && onLeft) {
        // Left swipe → forward/delete
        const clamped = Math.max(dx, -SWIPE_THRESHOLD * 1.5);
        onTranslate.current[messageId]?.(clamped); // negative value → left shift

        if (!activated.current[messageId] && dx <= -SWIPE_THRESHOLD) {
          activated.current[messageId] = true;
          haptic.medium();
        }
      }
    };

    const onTouchEnd = () => {
      const dx = currentX.current - startX.current;
      onTranslate.current[messageId]?.(0);

      if (directionLock.current[messageId] === 'right' && dx >= SWIPE_THRESHOLD) {
        onReply(messageId);
      } else if (
        directionLock.current[messageId] === 'left' &&
        dx <= -SWIPE_THRESHOLD &&
        onLeft
      ) {
        onLeft(messageId);
      }

      activated.current[messageId] = false;
      directionLock.current[messageId] = null;
    };

    // ── Mouse support (desktop) ──────────────────────────────────────────────
    let mouseDown = false;

    const onMouseDown = (e: React.MouseEvent) => {
      mouseDown = true;
      startX.current = e.clientX;
      startY.current = e.clientY;
      currentX.current = startX.current;
      activated.current[messageId] = false;
      directionLock.current[messageId] = null;
    };

    const onMouseMove = (e: React.MouseEvent) => {
      if (!mouseDown) return;
      const dx = e.clientX - startX.current;

      if (directionLock.current[messageId] === null) {
        if (Math.abs(dx) < DIRECTION_LOCK_THRESHOLD) return;
        directionLock.current[messageId] = dx > 0 ? 'right' : 'left';
      }

      currentX.current = e.clientX;

      if (directionLock.current[messageId] === 'right') {
        const clamped = Math.min(dx, SWIPE_THRESHOLD * 1.5);
        onTranslate.current[messageId]?.(clamped);
        if (!activated.current[messageId] && dx >= SWIPE_THRESHOLD) {
          activated.current[messageId] = true;
          haptic.medium();
        }
      } else if (directionLock.current[messageId] === 'left' && onLeft) {
        const clamped = Math.max(dx, -SWIPE_THRESHOLD * 1.5);
        onTranslate.current[messageId]?.(clamped);
        if (!activated.current[messageId] && dx <= -SWIPE_THRESHOLD) {
          activated.current[messageId] = true;
          haptic.medium();
        }
      }
    };

    const onMouseUp = () => {
      if (!mouseDown) return;
      mouseDown = false;
      const dx = currentX.current - startX.current;
      onTranslate.current[messageId]?.(0);

      if (directionLock.current[messageId] === 'right' && dx >= SWIPE_THRESHOLD) {
        onReply(messageId);
      } else if (
        directionLock.current[messageId] === 'left' &&
        dx <= -SWIPE_THRESHOLD &&
        onLeft
      ) {
        onLeft(messageId);
      }

      activated.current[messageId] = false;
      directionLock.current[messageId] = null;
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
  }, [onReply, onLeft, haptic]);

  return { bind };
}
