import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

interface SwipeBackGestureProps {
  children: React.ReactNode;
  /** Disable on certain pages (e.g. video call) */
  disabled?: boolean;
}

const EDGE_WIDTH = 20; // px from left edge
const THRESHOLD = 80;  // px to trigger back
const MAX_TRANSLATE = typeof window !== "undefined" ? window.innerWidth * 0.4 : 160;

export function SwipeBackGesture({ children, disabled }: SwipeBackGestureProps) {
  const navigate = useNavigate();
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const isActive = useRef(false);
  const didNavigate = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    const touch = e.touches[0];
    if (touch.clientX > EDGE_WIDTH) return;
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    isActive.current = true;
    didNavigate.current = false;
  }, [disabled]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isActive.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startX.current;
    const dy = Math.abs(touch.clientY - startY.current);

    if (!isDragging && dy > dx * 0.7) {
      isActive.current = false;
      return;
    }

    if (dx > 10) {
      setIsDragging(true);
      const clamped = Math.min(dx, MAX_TRANSLATE);
      setOffsetX(clamped);
    }
  }, [isDragging]);

  const onTouchEnd = useCallback(() => {
    if (!isActive.current) return;
    isActive.current = false;

    if (offsetX >= THRESHOLD && !didNavigate.current) {
      didNavigate.current = true;
      navigate(-1);
    }

    setOffsetX(0);
    setIsDragging(false);
  }, [offsetX, navigate]);

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Shadow overlay during swipe */}
      {isDragging && (
        <motion.div
          className="absolute inset-0 z-40 pointer-events-none"
          style={{
            background: `linear-gradient(to right, rgba(0,0,0,${0.3 * (1 - offsetX / MAX_TRANSLATE)}) 0%, transparent 40%)`,
          }}
        />
      )}

      {/* Content with offset */}
      <motion.div
        className="h-full w-full"
        animate={{ x: isDragging ? offsetX : 0 }}
        transition={isDragging ? { type: "tween", duration: 0 } : { type: "spring", stiffness: 400, damping: 30 }}
      >
        {children}
      </motion.div>

      {/* Left edge indicator */}
      {isDragging && (
        <motion.div
          className="absolute left-0 top-1/2 -translate-y-1/2 z-50 w-1 rounded-full bg-white/30"
          style={{ height: 40 }}
          animate={{
            opacity: offsetX >= THRESHOLD ? 1 : 0.4,
            scaleY: offsetX >= THRESHOLD ? 1.5 : 1,
          }}
        />
      )}
    </div>
  );
}
