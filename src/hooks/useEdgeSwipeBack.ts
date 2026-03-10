/**
 * useEdgeSwipeBack — iOS-style edge swipe to navigate back.
 *
 * When the user starts a touch within `edgeWidth` pixels of the LEFT edge
 * of the screen and drags rightward, this hook:
 *   1. Tracks drag progress (0..1).
 *   2. Calls `onBack()` when drag exceeds `threshold` px.
 *   3. Returns `progress` for animating a back-transition effect on the
 *      current page (e.g., translate + dim as user swipes).
 *
 * Typically combined with React Router's navigate(-1):
 *   const { progress } = useEdgeSwipeBack({ onBack: () => navigate(-1) });
 *   <div style={{ transform: `translateX(${progress * 30}px)`, opacity: 1 - progress * 0.3 }}>
 *
 * Only activates from the left edge — does not interfere with horizontal
 * scroll or swipe gestures in the middle of the screen.
 */

import { useEffect, useRef, useState } from 'react';

export interface UseEdgeSwipeBackOptions {
  /** Called when back gesture fires */
  onBack: () => void;
  /** Width of activation zone from left edge. Default: 20px */
  edgeWidth?: number;
  /** Drag distance to trigger back. Default: 80px */
  threshold?: number;
  /** Whether gesture is active */
  enabled?: boolean;
}

export interface UseEdgeSwipeBackResult {
  /** 0..1 progress of the back gesture */
  progress: number;
}

export function useEdgeSwipeBack({
  onBack,
  edgeWidth = 20,
  threshold = 80,
  enabled = true,
}: UseEdgeSwipeBackOptions): UseEdgeSwipeBackResult {
  const [progress, setProgress] = useState(0);
  const activeRef = useRef(false); // gesture started from edge
  const startXRef = useRef(0);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;

      if (touch.clientX <= edgeWidth) {
        // Started in edge zone — begin tracking
        activeRef.current = true;
        startXRef.current = touch.clientX;
        firedRef.current = false;
        setProgress(0);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!activeRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;

      const dx = touch.clientX - startXRef.current;
      const dy = Math.abs(touch.clientY - (e.changedTouches[0]?.clientY ?? 0));

      // Cancel if vertical movement dominates
      if (dy > Math.abs(dx) * 0.8) {
        activeRef.current = false;
        setProgress(0);
        return;
      }

      if (dx < 0) {
        // Going left — cancel
        activeRef.current = false;
        setProgress(0);
        return;
      }

      const p = Math.min(dx / threshold, 1);
      setProgress(p);
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!activeRef.current) return;
      const touch = e.changedTouches[0];
      if (!touch) return;

      const dx = touch.clientX - startXRef.current;

      activeRef.current = false;

      if (dx >= threshold && !firedRef.current) {
        firedRef.current = true;
        setProgress(0);
        onBack();
      } else {
        // Spring back
        setProgress(0);
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [enabled, edgeWidth, threshold, onBack]);

  return { progress };
}
