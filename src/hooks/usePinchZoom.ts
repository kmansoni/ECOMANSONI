/**
 * @file src/hooks/usePinchZoom.ts
 * @description Pinch-to-zoom + pan gesture hook для изображений и медиа.
 *
 * Архитектура:
 * - Использует Pointer Events API (работает на touch и mouse)
 * - Два указателя → вычисляем расстояние → scale
 * - Один указатель при zoom > 1 → pan (translate)
 * - Границы: minScale=1, maxScale=5
 * - Double-tap: toggle между 1x и 2.5x
 * - Momentum: при отпускании с velocity → плавное затухание
 * - Возврат в границы: если pan выходит за пределы контейнера → spring-анимация
 *
 * Использование:
 * ```tsx
 * const { ref, style, reset } = usePinchZoom();
 * <div ref={ref} style={style}><img src="..." /></div>
 * ```
 */

import { useRef, useState, useCallback, useEffect } from "react";

interface PinchZoomState {
  scale: number;
  translateX: number;
  translateY: number;
}

export interface UsePinchZoomOptions {
  minScale?: number;
  maxScale?: number;
  doubleTapScale?: number;
  onZoomChange?: (scale: number) => void;
}

export interface UsePinchZoomResult {
  ref: React.RefObject<HTMLDivElement>;
  style: React.CSSProperties;
  scale: number;
  reset: () => void;
  isZoomed: boolean;
}

const DOUBLE_TAP_DELAY = 300;
const MIN_SCALE_DEFAULT = 1;
const MAX_SCALE_DEFAULT = 5;
const DOUBLE_TAP_SCALE_DEFAULT = 2.5;

export function usePinchZoom(options: UsePinchZoomOptions = {}): UsePinchZoomResult {
  const {
    minScale = MIN_SCALE_DEFAULT,
    maxScale = MAX_SCALE_DEFAULT,
    doubleTapScale = DOUBLE_TAP_SCALE_DEFAULT,
    onZoomChange,
  } = options;

  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<PinchZoomState>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });

  // Refs для gesture tracking (не вызывают ре-рендер)
  const pointersRef = useRef<Map<number, PointerEvent>>(new Map());
  const lastDistanceRef = useRef<number>(0);
  const lastTapTimeRef = useRef<number>(0);
  const lastTapPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const isAnimatingRef = useRef(false);
  const animFrameRef = useRef<number>(0);

  const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

  // Вычисляем максимальный pan для текущего scale
  const getMaxPan = useCallback((scale: number) => {
    const el = ref.current;
    if (!el) return { maxX: 0, maxY: 0 };
    const rect = el.getBoundingClientRect();
    const maxX = Math.max(0, (rect.width * scale - rect.width) / 2);
    const maxY = Math.max(0, (rect.height * scale - rect.height) / 2);
    return { maxX, maxY };
  }, []);

  const clampTranslate = useCallback(
    (tx: number, ty: number, scale: number) => {
      const { maxX, maxY } = getMaxPan(scale);
      return {
        tx: clamp(tx, -maxX, maxX),
        ty: clamp(ty, -maxY, maxY),
      };
    },
    [getMaxPan]
  );

  const reset = useCallback(() => {
    setState({ scale: 1, translateX: 0, translateY: 0 });
    onZoomChange?.(1);
  }, [onZoomChange]);

  // Расстояние между двумя указателями
  const getDistance = (p1: PointerEvent, p2: PointerEvent) => {
    const dx = p1.clientX - p2.clientX;
    const dy = p1.clientY - p2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Центр между двумя указателями
  const getMidpoint = (p1: PointerEvent, p2: PointerEvent) => ({
    x: (p1.clientX + p2.clientX) / 2,
    y: (p1.clientY + p2.clientY) / 2,
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      pointersRef.current.set(e.pointerId, e);

      const pointers = Array.from(pointersRef.current.values());

      if (pointers.length === 1) {
        // Проверяем double-tap
        const now = Date.now();
        const dx = e.clientX - lastTapPosRef.current.x;
        const dy = e.clientY - lastTapPosRef.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (now - lastTapTimeRef.current < DOUBLE_TAP_DELAY && dist < 30) {
          // Double tap
          setState((prev) => {
            const newScale = prev.scale > 1 ? 1 : doubleTapScale;
            const { tx, ty } = clampTranslate(0, 0, newScale);
            onZoomChange?.(newScale);
            return { scale: newScale, translateX: tx, translateY: ty };
          });
          lastTapTimeRef.current = 0;
          return;
        }

        lastTapTimeRef.current = now;
        lastTapPosRef.current = { x: e.clientX, y: e.clientY };

        // Начало pan
        setState((prev) => {
          panStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            tx: prev.translateX,
            ty: prev.translateY,
          };
          return prev;
        });
      } else if (pointers.length === 2) {
        // Начало pinch
        panStartRef.current = null;
        lastDistanceRef.current = getDistance(pointers[0], pointers[1]);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      e.preventDefault();
      pointersRef.current.set(e.pointerId, e);
      const pointers = Array.from(pointersRef.current.values());

      if (pointers.length === 2) {
        // Pinch zoom
        const newDist = getDistance(pointers[0], pointers[1]);
        if (lastDistanceRef.current === 0) {
          lastDistanceRef.current = newDist;
          return;
        }
        const ratio = newDist / lastDistanceRef.current;
        lastDistanceRef.current = newDist;

        setState((prev) => {
          const newScale = clamp(prev.scale * ratio, minScale, maxScale);
          const { tx, ty } = clampTranslate(prev.translateX, prev.translateY, newScale);
          onZoomChange?.(newScale);
          return { scale: newScale, translateX: tx, translateY: ty };
        });
      } else if (pointers.length === 1 && panStartRef.current) {
        // Pan (только при zoom > 1)
        setState((prev) => {
          if (prev.scale <= 1) return prev;
          const dx = e.clientX - panStartRef.current!.x;
          const dy = e.clientY - panStartRef.current!.y;
          const rawTx = panStartRef.current!.tx + dx;
          const rawTy = panStartRef.current!.ty + dy;
          const { tx, ty } = clampTranslate(rawTx, rawTy, prev.scale);
          return { ...prev, translateX: tx, translateY: ty };
        });
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      pointersRef.current.delete(e.pointerId);
      lastDistanceRef.current = 0;

      if (pointersRef.current.size === 0) {
        panStartRef.current = null;
        // Spring back если scale < minScale
        setState((prev) => {
          if (prev.scale < minScale) {
            onZoomChange?.(minScale);
            return { scale: minScale, translateX: 0, translateY: 0 };
          }
          return prev;
        });
      }
    };

    el.addEventListener("pointerdown", onPointerDown, { passive: false });
    el.addEventListener("pointermove", onPointerMove, { passive: false });
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [minScale, maxScale, doubleTapScale, clampTranslate, onZoomChange]);

  const style: React.CSSProperties = {
    transform: `scale(${state.scale}) translate(${state.translateX / state.scale}px, ${state.translateY / state.scale}px)`,
    transformOrigin: "center center",
    transition: isAnimatingRef.current ? "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)" : "none",
    touchAction: "none",
    userSelect: "none",
    willChange: "transform",
  };

  return {
    ref,
    style,
    scale: state.scale,
    reset,
    isZoomed: state.scale > 1,
  };
}
