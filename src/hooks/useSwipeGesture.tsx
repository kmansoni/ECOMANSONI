/**
 * useSwipeGesture — vertical swipe gesture with bidirectional progress tracking.
 *
 * Fixes over the original version:
 *   1. Progress for UPWARD swipe was absent — now tracked symmetrically.
 *   2. Direction committed after 12px to avoid false triggers from diagonal taps.
 *   3. touchmove preventDefault only fires after direction is committed,
 *      so native vertical scroll still works for accidental near-diagonal touches.
 *   4. Cleanup of RAF on unmount.
 */

import { useRef, useEffect, useCallback, useState } from 'react';

interface UseSwipeGestureOptions {
  threshold?: number;
  onSwipeDown?: () => void;
  onSwipeUp?: () => void;
  enabled?: boolean;
}

interface SwipeState {
  /** -1..0 (upward) or 0..1 (downward). 0 when idle. */
  progress: number;
  isDragging: boolean;
  direction: 'up' | 'down' | null;
}

const DIRECTION_LOCK_PX = 12;

export function useSwipeGesture(
  ref: React.RefObject<HTMLElement>,
  options: UseSwipeGestureOptions = {}
): SwipeState {
  const { threshold = 60, onSwipeDown, onSwipeUp, enabled = true } = options;
  
  const [state, setState] = useState<SwipeState>({
    progress: 0,
    isDragging: false,
    direction: null,
  });

  const startY = useRef<number>(0);
  const currentY = useRef<number>(0);
  const isDragging = useRef<boolean>(false);
  const directionLocked = useRef<'up' | 'down' | null>(null);
  const rafId = useRef<number>();

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled) return;
    startY.current = e.touches[0]!.clientY;
    currentY.current = startY.current;
    isDragging.current = true;
    directionLocked.current = null;
    setState({ progress: 0, isDragging: true, direction: null });
  }, [enabled]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!enabled || !isDragging.current) return;

    currentY.current = e.touches[0]!.clientY;
    const deltaY = currentY.current - startY.current;

    // Lock direction once movement exceeds threshold
    if (directionLocked.current === null) {
      if (Math.abs(deltaY) < DIRECTION_LOCK_PX) return; // not committed yet
      directionLocked.current = deltaY > 0 ? 'down' : 'up';
    }

    // Only prevent scrolling after direction is committed
    e.preventDefault();

    if (rafId.current) cancelAnimationFrame(rafId.current);

    rafId.current = requestAnimationFrame(() => {
      const dir = directionLocked.current;
      if (dir === 'down') {
        const progress = Math.min(deltaY / threshold, 1);
        setState({ progress, isDragging: true, direction: 'down' });
      } else if (dir === 'up') {
        // progress is negative (-1..0) for upward
        const progress = Math.max(deltaY / threshold, -1);
        setState({ progress, isDragging: true, direction: 'up' });
      }
    });
  }, [enabled, threshold]);

  const handleTouchEnd = useCallback(() => {
    if (!enabled || !isDragging.current) return;

    const deltaY = currentY.current - startY.current;
    isDragging.current = false;

    if (rafId.current) cancelAnimationFrame(rafId.current);

    if (deltaY > threshold) {
      onSwipeDown?.();
    } else if (deltaY < -threshold) {
      onSwipeUp?.();
    }

    setState({ progress: 0, isDragging: false, direction: null });
    directionLocked.current = null;
  }, [enabled, threshold, onSwipeDown, onSwipeUp]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    // passive: false is required to call preventDefault() inside handleTouchMove
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [ref, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return state;
}
