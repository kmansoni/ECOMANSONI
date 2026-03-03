import { useRef, useState, ReactNode, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface DoubleTapReactionProps {
  messageId: string;
  onToggleReaction: (messageId: string, emoji: string) => void;
  hasReaction?: boolean;
  children: ReactNode;
}

const DOUBLE_TAP_DELAY = 300;

export function DoubleTapReaction({
  messageId,
  onToggleReaction,
  hasReaction = false,
  children,
}: DoubleTapReactionProps) {
  const lastTap = useRef(0);
  const [showHeart, setShowHeart] = useState(false);

  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_DELAY) {
      navigator.vibrate?.(10);
      onToggleReaction(messageId, '❤️');
      if (!hasReaction) {
        setShowHeart(true);
        setTimeout(() => setShowHeart(false), 800);
      }
    }
    lastTap.current = now;
  }, [messageId, onToggleReaction, hasReaction]);

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
