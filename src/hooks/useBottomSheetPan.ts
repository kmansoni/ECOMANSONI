/**
 * useBottomSheetPan — bottom sheet pan gesture with snap points.
 *
 * Features:
 *   - Drag handle responds to touch and mouse.
 *   - Snap points defined as fractions of viewport height [0..1].
 *     0 = top of screen, 1 = fully off screen (closed).
 *     Example: [0.1, 0.5, 1.0] → three snap points (expanded, half, closed).
 *   - Fling velocity detection: fast drag downward → skip to close regardless of position.
 *   - Spring-back animation via CSS transition (no JS animation loop needed).
 *   - Backdrop opacity scales with sheet position.
 *   - Returns `style` object and `state`:
 *       style.transform — apply to the sheet container
 *       style.transition — apply to the sheet container
 *       backdropOpacity — apply to overlay
 *
 * Usage:
 *   const { handleRef, containerRef, style, backdropOpacity, currentSnap } =
 *     useBottomSheetPan({ snapPoints: [0.1, 0.5, 1], onClose, initialSnap: 0.5 });
 *
 *   <div
 *     ref={containerRef}
 *     style={{ transform: style.transform, transition: style.transition, position: 'fixed', bottom: 0 }}
 *   >
 *     <div ref={handleRef} style={{ cursor: 'grab' }}>
 *       <div className="h-1 w-10 bg-gray-400 rounded mx-auto my-2" />
 *     </div>
 *     {children}
 *   </div>
 */

import { useRef, useState, useEffect, useCallback } from 'react';

export interface UseBottomSheetPanOptions {
  /**
   * Snap points as fraction of viewport height (0 = visible top, 1 = hidden).
   * Must include 1.0 or similar for the "closed" state.
   * Default: [0.05, 1.0]
   */
  snapPoints?: number[];
  /** Initial snap point index (default: 0 → first/topmost snap) */
  initialSnap?: number;
  /** Called when sheet snaps to the last (close) snap point */
  onClose?: () => void;
  /** Velocity threshold (px/ms) above which fling-to-close fires immediately */
  closeVelocityThreshold?: number;
  /** Whether gesture is enabled */
  enabled?: boolean;
}

export interface UseBottomSheetPanResult {
  /** Attach to the drag handle element */
  handleRef: React.RefObject<HTMLDivElement>;
  /** Current snap point index */
  currentSnap: number;
  /** Apply to the sheet wrapper element */
  style: {
    transform: string;
    transition: string;
    willChange: string;
  };
  /** 0..1 backdrop opacity based on sheet position */
  backdropOpacity: number;
  /** Programmatically snap to a point by index */
  snapTo: (index: number) => void;
}

const DEFAULT_SNAP_POINTS = [0.05, 1.0];
const SPRING_TRANSITION = 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)';
const DRAG_TRANSITION = 'none';

export function useBottomSheetPan({
  snapPoints = DEFAULT_SNAP_POINTS,
  initialSnap = 0,
  onClose,
  closeVelocityThreshold = 0.5,
  enabled = true,
}: UseBottomSheetPanOptions = {}): UseBottomSheetPanResult {
  const handleRef = useRef<HTMLDivElement>(null);

  const [currentSnap, setCurrentSnap] = useState(initialSnap);
  const [offsetY, setOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const startYRef = useRef(0);
  const startOffsetRef = useRef(0);
  const lastYRef = useRef(0);
  const lastTimeRef = useRef(0);
  const velocityRef = useRef(0);

  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;

  // Compute raw translate Y from snap fraction
  const snapFractionToY = useCallback(
    (fraction: number) => fraction * viewportH,
    [viewportH],
  );

  // Snap to the closest point or close
  const findClosestSnap = useCallback(
    (currentY: number, velocity: number): number => {
      const currentFraction = currentY / viewportH;

      // Fast downward fling → close
      if (velocity > closeVelocityThreshold) {
        return snapPoints.length - 1;
      }

      let closestIdx = 0;
      let closestDist = Infinity;
      for (let i = 0; i < snapPoints.length; i++) {
        const d = Math.abs(snapPoints[i]! - currentFraction);
        if (d < closestDist) {
          closestDist = d;
          closestIdx = i;
        }
      }
      return closestIdx;
    },
    [viewportH, snapPoints, closeVelocityThreshold],
  );

  const snapTo = useCallback(
    (index: number) => {
      const safeIdx = Math.max(0, Math.min(snapPoints.length - 1, index));
      setCurrentSnap(safeIdx);
      setOffsetY(snapFractionToY(snapPoints[safeIdx]!));
      if (safeIdx === snapPoints.length - 1) {
        onClose?.();
      }
    },
    [snapPoints, snapFractionToY, onClose],
  );

  // Initialize to initial snap position
  useEffect(() => {
    setOffsetY(snapFractionToY(snapPoints[initialSnap] ?? snapPoints[0] ?? 0));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle || !enabled) return;

    const onStart = (clientY: number) => {
      startYRef.current = clientY;
      startOffsetRef.current = offsetY;
      lastYRef.current = clientY;
      lastTimeRef.current = Date.now();
      velocityRef.current = 0;
      setIsDragging(true);
    };

    const onMove = (clientY: number) => {
      const dt = Date.now() - lastTimeRef.current;
      if (dt > 0) {
        velocityRef.current = (clientY - lastYRef.current) / dt;
      }
      lastYRef.current = clientY;
      lastTimeRef.current = Date.now();

      const delta = clientY - startYRef.current;
      const newY = Math.max(0, startOffsetRef.current + delta);
      setOffsetY(newY);
    };

    const onEnd = () => {
      setIsDragging(false);
      const snapIdx = findClosestSnap(offsetY, velocityRef.current);
      snapTo(snapIdx);
    };

    // Touch handlers
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) onStart(e.touches[0].clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) onMove(e.touches[0].clientY);
    };
    const onTouchEnd = () => onEnd();

    // Mouse handlers
    let mouseActive = false;
    const onMouseDown = (e: MouseEvent) => {
      mouseActive = true;
      onStart(e.clientY);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    };
    const onMouseMove = (e: MouseEvent) => { if (mouseActive) onMove(e.clientY); };
    const onMouseUp = () => {
      if (!mouseActive) return;
      mouseActive = false;
      onEnd();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    handle.addEventListener('touchstart', onTouchStart, { passive: true });
    handle.addEventListener('touchmove', onTouchMove, { passive: false });
    handle.addEventListener('touchend', onTouchEnd, { passive: true });
    handle.addEventListener('mousedown', onMouseDown);

    return () => {
      handle.removeEventListener('touchstart', onTouchStart);
      handle.removeEventListener('touchmove', onTouchMove);
      handle.removeEventListener('touchend', onTouchEnd);
      handle.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [enabled, offsetY, findClosestSnap, snapTo]);

  // Compute backdrop opacity (max at first snap, 0 at close snap)
  const firstSnapY = snapFractionToY(snapPoints[0] ?? 0);
  const lastSnapY = snapFractionToY(snapPoints[snapPoints.length - 1] ?? 1);
  const backdropOpacity =
    lastSnapY > firstSnapY
      ? Math.max(0, 1 - (offsetY - firstSnapY) / (lastSnapY - firstSnapY))
      : 1;

  return {
    handleRef,
    currentSnap,
    style: {
      transform: `translateY(${offsetY.toFixed(1)}px)`,
      transition: isDragging ? DRAG_TRANSITION : SPRING_TRANSITION,
      willChange: 'transform',
    },
    backdropOpacity: Math.min(1, Math.max(0, backdropOpacity)),
    snapTo,
  };
}
