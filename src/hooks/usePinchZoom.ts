/**
 * usePinchZoom — pinch-to-zoom + pan gesture hook for photo/media viewers.
 *
 * Features:
 *   - Pinch two fingers to zoom (scale 1x–5x, clamped).
 *   - Double-tap to toggle between 1x and 2.5x.
 *   - Pan (drag) when zoomed in (clamped to image bounds).
 *   - Single-finger swipe-to-close when at 1x (pull down to dismiss).
 *   - Returns transform CSS string for direct apply to `style.transform`.
 *   - Resets on prop `active` turning false.
 *
 * Usage:
 *   const { ref, transform, isZoomed, onSwipeClose } = usePinchZoom({ onClose });
 *   <div ref={ref} style={{ transform, transformOrigin: 'center', touchAction: 'none' }}>
 *     <img src={url} />
 *   </div>
 */

import { useRef, useState, useCallback, useEffect } from 'react';

export interface UsePinchZoomOptions {
  /** Called when user swipes down to dismiss at 1x zoom */
  onClose?: () => void;
  /** Min/max allowed scale */
  minScale?: number;
  maxScale?: number;
  /** Pixels of vertical drag at 1x that triggers close */
  closeThreshold?: number;
  /** Whether gesture is enabled */
  enabled?: boolean;
}

export interface UsePinchZoomResult {
  ref: React.RefObject<HTMLDivElement>;
  /** CSS transform string: `translate(Xpx, Ypx) scale(Z)` */
  transform: string;
  isZoomed: boolean;
  /** Reset to 1x, 0 offset */
  reset: () => void;
}

function getDistance(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function getMidpoint(a: Touch, b: Touch): { x: number; y: number } {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}

export function usePinchZoom({
  onClose,
  minScale = 1,
  maxScale = 5,
  closeThreshold = 80,
  enabled = true,
}: UsePinchZoomOptions = {}): UsePinchZoomResult {
  const ref = useRef<HTMLDivElement>(null);

  // State stored in refs to avoid re-renders during gesture (only commit to state at end)
  const scaleRef = useRef(1);
  const offsetXRef = useRef(0);
  const offsetYRef = useRef(0);
  const [transform, setTransform] = useState('translate(0px,0px) scale(1)');
  const [isZoomed, setIsZoomed] = useState(false);

  // Pinch tracking
  const lastDistRef = useRef(0);
  const lastMidRef = useRef({ x: 0, y: 0 });

  // Pan tracking
  const panStartRef = useRef({ x: 0, y: 0 });
  const panOffsetStartRef = useRef({ x: 0, y: 0 });

  // Double-tap tracking
  const lastTapRef = useRef(0);
  const doubleTapScaleTarget = 2.5;

  const commitTransform = useCallback((scale: number, ox: number, oy: number) => {
    const t = `translate(${ox.toFixed(1)}px, ${oy.toFixed(1)}px) scale(${scale.toFixed(3)})`;
    setTransform(t);
    setIsZoomed(scale > 1.05);
  }, []);

  const reset = useCallback(() => {
    scaleRef.current = 1;
    offsetXRef.current = 0;
    offsetYRef.current = 0;
    commitTransform(1, 0, 0);
  }, [commitTransform]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];

        // Double-tap detection
        const now = Date.now();
        if (now - lastTapRef.current < 300) {
          // Double tap
          if (scaleRef.current > 1.05) {
            // Already zoomed — reset
            scaleRef.current = 1;
            offsetXRef.current = 0;
            offsetYRef.current = 0;
          } else {
            scaleRef.current = doubleTapScaleTarget;
            // Zoom towards tap point
            const rect = el.getBoundingClientRect();
            const cx = touch.clientX - rect.left - rect.width / 2;
            const cy = touch.clientY - rect.top - rect.height / 2;
            offsetXRef.current = -cx * (doubleTapScaleTarget - 1);
            offsetYRef.current = -cy * (doubleTapScaleTarget - 1);
          }
          commitTransform(scaleRef.current, offsetXRef.current, offsetYRef.current);
          lastTapRef.current = 0;
          return;
        }
        lastTapRef.current = now;

        // Pan start
        panStartRef.current = { x: touch.clientX, y: touch.clientY };
        panOffsetStartRef.current = { x: offsetXRef.current, y: offsetYRef.current };
      } else if (e.touches.length === 2) {
        // Pinch start
        lastDistRef.current = getDistance(e.touches[0], e.touches[1]);
        lastMidRef.current = getMidpoint(e.touches[0], e.touches[1]);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault(); // prevent scroll/zoom at browser level

      if (e.touches.length === 2) {
        // Pinch zoom
        const dist = getDistance(e.touches[0], e.touches[1]);
        const ratio = dist / lastDistRef.current;
        const newScale = Math.min(maxScale, Math.max(minScale, scaleRef.current * ratio));
        scaleRef.current = newScale;
        lastDistRef.current = dist;

        commitTransform(scaleRef.current, offsetXRef.current, offsetYRef.current);
      } else if (e.touches.length === 1) {
        const touch = e.touches[0];
        const dx = touch.clientX - panStartRef.current.x;
        const dy = touch.clientY - panStartRef.current.y;

        if (scaleRef.current <= 1.05 && Math.abs(dy) > Math.abs(dx)) {
          // At 1x and vertical movement → potential swipe-to-close
          // Show drag progress but don't pan horizontally
          const closeY = panOffsetStartRef.current.y + dy;
          commitTransform(1, 0, closeY);
          return;
        }

        // Normal pan (only when zoomed)
        if (scaleRef.current > 1.05) {
          offsetXRef.current = panOffsetStartRef.current.x + dx;
          offsetYRef.current = panOffsetStartRef.current.y + dy;

          // Clamp pan to image bounds
          const rect = el.getBoundingClientRect();
          const maxPanX = (rect.width * (scaleRef.current - 1)) / 2;
          const maxPanY = (rect.height * (scaleRef.current - 1)) / 2;
          offsetXRef.current = Math.max(-maxPanX, Math.min(maxPanX, offsetXRef.current));
          offsetYRef.current = Math.max(-maxPanY, Math.min(maxPanY, offsetYRef.current));

          commitTransform(scaleRef.current, offsetXRef.current, offsetYRef.current);
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        // Check swipe-to-close
        if (scaleRef.current <= 1.05 && Math.abs(offsetYRef.current) > closeThreshold) {
          reset();
          onClose?.();
          return;
        }

        // Spring back if dragged but not enough
        if (scaleRef.current <= 1.05) {
          offsetXRef.current = 0;
          offsetYRef.current = 0;
          commitTransform(1, 0, 0);
        }
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [enabled, minScale, maxScale, closeThreshold, onClose, commitTransform, reset]);

  return { ref, transform, isZoomed, reset };
}
