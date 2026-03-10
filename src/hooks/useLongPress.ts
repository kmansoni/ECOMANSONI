/**
 * useLongPress — production-grade long press detection hook.
 *
 * Behaviour mirrors Telegram/WhatsApp:
 *   - Fires `onLongPress` after `delay` ms of continuous press.
 *   - Fires haptic feedback at trigger point.
 *   - Cancels if pointer moves more than `moveThreshold` px.
 *   - Cancels on pointer up / context menu.
 *   - Prevents default context menu on mobile (overrides browser hold-to-select).
 *   - Returns `isPressed` state for visual feedback (highlight, scale).
 *
 * Supports both touch and mouse (desktop).
 *
 * Usage:
 *   const { handlers, isPressed } = useLongPress(() => openContextMenu(msg));
 *   <div {...handlers} style={{ opacity: isPressed ? 0.7 : 1 }}>...</div>
 */

import { useRef, useState, useCallback, useEffect } from 'react';

export interface UseLongPressOptions {
  /** Milliseconds to hold before triggering. Default: 500 */
  delay?: number;
  /** Pixels of movement that cancels the press. Default: 10 */
  moveThreshold?: number;
  /** Called when long press fires */
  onLongPress: (event: React.TouchEvent | React.MouseEvent) => void;
  /** Called on short tap (press + release < delay) */
  onTap?: (event: React.TouchEvent | React.MouseEvent) => void;
  /** Whether the gesture is active */
  enabled?: boolean;
}

export interface UseLongPressResult {
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: (e: React.TouchEvent) => void;
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseUp: (e: React.MouseEvent) => void;
    onContextMenu: (e: React.MouseEvent) => void;
  };
  isPressed: boolean;
}

export function useLongPress(options: UseLongPressOptions): UseLongPressResult {
  const {
    delay = 500,
    moveThreshold = 10,
    onLongPress,
    onTap,
    enabled = true,
  } = options;

  const [isPressed, setIsPressed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const firedRef = useRef(false); // did long press fire this gesture?
  const eventRef = useRef<React.TouchEvent | React.MouseEvent | null>(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const start = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (!enabled) return;

      const { clientX, clientY } =
        'touches' in e ? e.touches[0] : e;

      startXRef.current = clientX;
      startYRef.current = clientY;
      firedRef.current = false;
      eventRef.current = e;
      setIsPressed(true);

      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        setIsPressed(false);
        // Haptic feedback — navigator.vibrate is available on Android
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(25);
        }
        onLongPress(eventRef.current!);
      }, delay);
    },
    [enabled, delay, onLongPress],
  );

  const move = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (!enabled || !timerRef.current) return;

      const { clientX, clientY } =
        'touches' in e ? e.touches[0] : e;

      const dx = Math.abs(clientX - startXRef.current);
      const dy = Math.abs(clientY - startYRef.current);

      if (dx > moveThreshold || dy > moveThreshold) {
        // Movement too large — cancel long press
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setIsPressed(false);
      }
    },
    [enabled, moveThreshold],
  );

  const end = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (!enabled) return;

      const wasFired = firedRef.current;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setIsPressed(false);

      if (!wasFired && onTap) {
        onTap(e);
      }
    },
    [enabled, onTap],
  );

  const cancelContext = useCallback((e: React.MouseEvent) => {
    // On mobile, long press triggers context menu — we want to suppress it
    // so that our custom action sheet shows instead.
    if (enabled) {
      e.preventDefault();
    }
  }, [enabled]);

  return {
    handlers: {
      onTouchStart: start as (e: React.TouchEvent) => void,
      onTouchMove: move as (e: React.TouchEvent) => void,
      onTouchEnd: end as (e: React.TouchEvent) => void,
      onMouseDown: start as (e: React.MouseEvent) => void,
      onMouseMove: move as (e: React.MouseEvent) => void,
      onMouseUp: end as (e: React.MouseEvent) => void,
      onContextMenu: cancelContext,
    },
    isPressed,
  };
}
