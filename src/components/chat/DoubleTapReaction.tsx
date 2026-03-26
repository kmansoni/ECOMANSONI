import { useRef, useState, ReactNode, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface DoubleTapReactionProps {
  messageId: string;
  onToggleReaction: (messageId: string, emoji: string) => void;
  hasReaction?: boolean;
  /** When true, double-tap detection is suppressed (e.g. during selection mode). */
  disabled?: boolean;
  children: ReactNode;
}

const DOUBLE_TAP_DELAY = 300;
const HEART_DISPLAY_MS = 800;

export function DoubleTapReaction({
  messageId,
  onToggleReaction,
  hasReaction = false,
  disabled = false,
  children,
}: DoubleTapReactionProps) {
  const lastTap = useRef(0);
  const [showHeart, setShowHeart] = useState(false);
  // P0-014: Store timer ref to clear on unmount — prevents setState on unmounted component
  const heartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // P0-014: Cleanup timer on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (heartTimerRef.current !== null) {
        clearTimeout(heartTimerRef.current);
      }
    };
  }, []);

  const handleTap = useCallback(() => {
    if (disabled) return;
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_DELAY) {
      navigator.vibrate?.(10);
      onToggleReaction(messageId, '❤️');
      if (!hasReaction) {
        setShowHeart(true);
        // P0-014: Cancel any pending timer before scheduling a new one
        if (heartTimerRef.current !== null) {
          clearTimeout(heartTimerRef.current);
        }
        heartTimerRef.current = setTimeout(() => {
          setShowHeart(false);
          heartTimerRef.current = null;
        }, HEART_DISPLAY_MS);
      }
    }
    lastTap.current = now;
  }, [messageId, onToggleReaction, hasReaction, disabled]);

  return (
    <div onClick={handleTap} className="relative select-none">
      {children}
      <AnimatePresence>
        {showHeart && (
          <motion.div
            key="heart"
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            initial={{ scale: 0, opacity: 1 }}
            animate={{ scale: 1.5, opacity: 1 }}
            exit={{ scale: 2, opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <span className="text-5xl">❤️</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
