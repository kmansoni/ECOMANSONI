import React, { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReactionType } from '@/types/livestream';

const REACTIONS: ReactionType[] = ['❤️', '🔥', '👏', '😂', '😮', '🎉'];
const COOLDOWN_MS = 2000;

interface ReactionPickerProps {
  onReact: (type: ReactionType) => void;
  className?: string;
}

/**
 * Floating reaction picker popup.
 * - Tap the heart button to open/close.
 * - Click any emoji to send + 2s cooldown.
 * - Long-press ❤️ → burst of 5 hearts.
 */
export const ReactionPicker = React.memo(function ReactionPicker({
  onReact,
  className,
}: ReactionPickerProps) {
  const [open, setOpen] = useState(false);
  const [cooldownEmoji, setCooldownEmoji] = useState<ReactionType | null>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendReaction = useCallback(
    (type: ReactionType) => {
      if (cooldownEmoji === type) return;
      onReact(type);
      setCooldownEmoji(type);
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = setTimeout(() => setCooldownEmoji(null), COOLDOWN_MS);
    },
    [onReact, cooldownEmoji],
  );

  const handleLongPressStart = useCallback(() => {
    longPressTimerRef.current = setTimeout(() => {
      // Burst of 5 hearts
      for (let i = 0; i < 5; i++) {
        setTimeout(() => onReact('❤️'), i * 120);
      }
      setCooldownEmoji('❤️');
      cooldownTimerRef.current = setTimeout(() => setCooldownEmoji(null), COOLDOWN_MS);
    }, 500);
  }, [onReact]);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  }, []);

  return (
    <div className={cn('relative flex flex-col items-center gap-2', className)}>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="absolute bottom-full mb-2 flex gap-1 rounded-full bg-black/70 px-3 py-2 backdrop-blur-sm"
            role="listbox"
            aria-label="Send a reaction"
          >
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                role="option"
                aria-selected={false}
                aria-label={`React with ${emoji}`}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full text-xl transition-transform active:scale-90',
                  cooldownEmoji === emoji
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:scale-110 cursor-pointer',
                )}
                onClick={() => sendReaction(emoji)}
                onPointerDown={emoji === '❤️' ? handleLongPressStart : undefined}
                onPointerUp={emoji === '❤️' ? handleLongPressEnd : undefined}
                onPointerLeave={emoji === '❤️' ? handleLongPressEnd : undefined}
                disabled={cooldownEmoji === emoji}
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle reaction picker"
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-transform active:scale-90 hover:bg-black/70"
      >
        <Heart className="h-5 w-5" fill={open ? 'white' : 'none'} />
      </button>
    </div>
  );
});
