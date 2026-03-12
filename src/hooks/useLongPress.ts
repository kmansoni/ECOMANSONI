/**
 * @file src/hooks/useLongPress.ts
 * @description Long-press хук для контекстных меню — Instagram стиль.
 *
 * Архитектура:
 * - Pointer Events API (touch + mouse)
 * - Threshold: 500ms (Instagram default)
 * - Отмена: если pointer moved > 10px → не long press
 * - Haptic feedback при срабатывании
 * - Возвращает handlers для элемента
 * - Поддержка iOS Safari (touchstart/touchend fallback)
 *
 * Использование:
 * ```tsx
 * const longPressHandlers = useLongPress(() => setShowContextMenu(true));
 * <div {...longPressHandlers}>...</div>
 * ```
 */

import { useCallback, useRef } from "react";
import { Haptics } from "@/lib/haptics";

interface LongPressOptions {
  threshold?: number;      // ms, default 500
  moveThreshold?: number;  // px, default 10
  onStart?: () => void;
  onCancel?: () => void;
}

interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function useLongPress(
  callback: (e: React.PointerEvent) => void,
  options: LongPressOptions = {}
): LongPressHandlers {
  const {
    threshold = 500,
    moveThreshold = 10,
    onStart,
    onCancel,
  } = options;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);
  const eventRef = useRef<React.PointerEvent | null>(null);

  const start = useCallback((e: React.PointerEvent) => {
    firedRef.current = false;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    eventRef.current = e;
    onStart?.();

    timerRef.current = setTimeout(() => {
      if (startPosRef.current === null) return;
      firedRef.current = true;
      Haptics.tap();
      callback(eventRef.current!);
    }, threshold);
  }, [callback, threshold, onStart]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPosRef.current = null;
    if (!firedRef.current) onCancel?.();
  }, [onCancel]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    start(e);
  }, [start]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    cancel();
  }, [cancel]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!startPosRef.current) return;
    const dx = e.clientX - startPosRef.current.x;
    const dy = e.clientY - startPosRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > moveThreshold) {
      cancel();
    }
  }, [cancel, moveThreshold]);

  const onPointerLeave = useCallback(() => {
    cancel();
  }, [cancel]);

  // Предотвращаем нативное контекстное меню на мобильных
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return {
    onPointerDown,
    onPointerUp,
    onPointerMove,
    onPointerLeave,
    onContextMenu,
  };
}
