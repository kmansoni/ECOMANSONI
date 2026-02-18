import { useRef, useEffect, useCallback, useState } from 'react';

interface UseSwipeGestureOptions {
  threshold?: number;
  onSwipeDown?: () => void;
  onSwipeUp?: () => void;
  enabled?: boolean;
}

interface SwipeState {
  progress: number;
  isDragging: boolean;
}

export function useSwipeGesture(
  ref: React.RefObject<HTMLElement>,
  options: UseSwipeGestureOptions = {}
): SwipeState {
  const { threshold = 60, onSwipeDown, onSwipeUp, enabled = true } = options;
  
  const [state, setState] = useState<SwipeState>({ progress: 0, isDragging: false });
  const startY = useRef<number>(0);
  const currentY = useRef<number>(0);
  const isDragging = useRef<boolean>(false);
  const rafId = useRef<number>();

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled) return;
    startY.current = e.touches[0].clientY;
    currentY.current = startY.current;
    isDragging.current = true;
    setState(prev => ({ ...prev, isDragging: true }));
  }, [enabled]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!enabled || !isDragging.current) return;
    
    currentY.current = e.touches[0].clientY;
    const deltaY = currentY.current - startY.current;
    
    // Only track downward swipes for opening stories
    if (deltaY > 0) {
      if (rafId.current) cancelAnimationFrame(rafId.current);
      
      rafId.current = requestAnimationFrame(() => {
        const progress = Math.min(deltaY / threshold, 1);
        setState(prev => ({ ...prev, progress }));
      });
      
      // Prevent scroll while swiping
      if (deltaY > 10) {
        e.preventDefault();
      }
    }
  }, [enabled, threshold]);

  const handleTouchEnd = useCallback(() => {
    if (!enabled || !isDragging.current) return;
    
    const deltaY = currentY.current - startY.current;
    
    if (deltaY > threshold) {
      onSwipeDown?.();
    } else if (deltaY < -threshold) {
      onSwipeUp?.();
    }
    
    isDragging.current = false;
    setState({ progress: 0, isDragging: false });
    
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
    }
  }, [enabled, threshold, onSwipeDown, onSwipeUp]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
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
