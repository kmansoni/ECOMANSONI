import { useRef, useState, ReactNode } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { CornerUpLeft } from 'lucide-react';

const SWIPE_THRESHOLD = 60;

interface SwipeableMessageProps {
  messageId: string;
  onReply: (messageId: string) => void;
  children: ReactNode;
  disabled?: boolean;
}

export function SwipeableMessage({ messageId, onReply, children, disabled }: SwipeableMessageProps) {
  const x = useMotionValue(0);
  const iconOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const iconScale = useTransform(x, [0, SWIPE_THRESHOLD], [0.5, 1]);
  const startX = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const activated = useRef(false);
  const [vibrated, setVibrated] = useState(false);

  const snapBack = () => {
    animate(x, 0, { type: 'spring', stiffness: 400, damping: 30 });
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (disabled) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    dragging.current = true;
    activated.current = false;
    setVibrated(false);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current || disabled) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    const isVertical = Math.abs(dy) > Math.abs(dx);
    if (isVertical || dx < 0) {
      x.set(0);
      return;
    }
    const clamped = Math.min(dx, SWIPE_THRESHOLD * 1.5);
    x.set(clamped);
    if (!vibrated && dx >= SWIPE_THRESHOLD) {
      navigator.vibrate?.(25);
      setVibrated(true);
      activated.current = true;
    }
  };

  const onTouchEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (activated.current) {
      onReply(messageId);
    }
    snapBack();
  };

  return (
    <div className="relative overflow-hidden">
      {/* Reply icon behind message */}
      <motion.div
        className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-10 h-10 rounded-full bg-muted ml-1"
        style={{ opacity: iconOpacity, scale: iconScale }}
      >
        <CornerUpLeft className="w-5 h-5 text-primary" />
      </motion.div>

      <motion.div
        style={{ x }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </motion.div>
    </div>
  );
}
