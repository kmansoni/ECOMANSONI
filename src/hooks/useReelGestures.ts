import { useRef, useCallback } from "react";

const REELS_NAV_COOLDOWN_MS = 350;

interface UseReelGesturesOptions {
  onSwipeUp: () => void;
  onSwipeDown: () => void;
  onTap: (reelId: string, isLiked: boolean) => void;
  onLongPress: (reelId: string) => void;
  onSwipeLeft: (authorId: string) => void;
  lastNavAt: React.MutableRefObject<number>;
}

export function useReelGestures({
  onSwipeUp,
  onSwipeDown,
  onTap,
  onLongPress,
  onSwipeLeft,
  lastNavAt,
}: UseReelGesturesOptions) {
  const touchStartY = useRef<number | null>(null);
  const touchStartAt = useRef<number | null>(null);
  const swipeTouchStartX = useRef<number | null>(null);
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Container-level touch handlers (for swipe up/down)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartY.current = e.touches[0].clientY;
    touchStartAt.current = Date.now();
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const startY = touchStartY.current;
      const startAt = touchStartAt.current;
      touchStartY.current = null;
      touchStartAt.current = null;

      if (startY == null || startAt == null) return;
      const endY = e.changedTouches[0]?.clientY;
      if (typeof endY !== "number") return;

      const dy = endY - startY;
      const dt = Date.now() - startAt;

      const now = Date.now();
      if (now - lastNavAt.current < REELS_NAV_COOLDOWN_MS) return;

      if (dt > 800) return;
      if (Math.abs(dy) < 60) return;

      lastNavAt.current = now;

      if (dy < 0) {
        onSwipeUp();
      } else {
        onSwipeDown();
      }
    },
    [onSwipeUp, onSwipeDown, lastNavAt],
  );

  // Per-reel touch handlers (for swipe left → author profile)
  const handleReelTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    swipeTouchStartX.current = e.touches[0].clientX;
  }, []);

  const handleReelTouchEnd = useCallback((authorId: string, e: React.TouchEvent) => {
    const startX = swipeTouchStartX.current;
    swipeTouchStartX.current = null;
    if (startX == null) return;
    const dx = e.changedTouches[0]?.clientX - startX;
    if (dx < -80) {
      onSwipeLeft(authorId);
    }
  }, [onSwipeLeft]);

  // Pointer handlers for tap/double-tap/long-press
  const handlePointerDown = useCallback((reelId: string, isLiked: boolean) => {
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      onLongPress(reelId);
    }, 600);
  }, [onLongPress]);

  const handlePointerUp = useCallback((reelId: string, isLiked: boolean) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      onTap(reelId, isLiked);
    }
  }, [onTap]);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  return {
    handleTouchStart,
    handleTouchEnd,
    handleReelTouchStart,
    handleReelTouchEnd,
    handlePointerDown,
    handlePointerUp,
    clearLongPress,
  };
}
