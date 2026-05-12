/**
 * @file src/components/reels/ReelReactionPicker.tsx
 * @description Панель быстрых emoji-реакций.
 * Glass-styled picker с spring-анимациями.
 */

import React, { memo, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================================
// TYPES
// ============================================================================

interface ReelReactionPickerProps {
  reactionCounts: Array<{ emoji: string; count: number; has_reacted: boolean }>;
  myReaction: string | null;
  onReaction: (emoji: string) => void;
  position?: { x: number; y: number };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_EMOJIS = ['❤️', '🔥', '😂', '😮', '😢', '👏', '💯', '🙏', '🎉', '🤔'] as const;
const SPRING = { type: 'spring' as const, stiffness: 400, damping: 15 };

// ============================================================================
// EMOJI BUTTON
// ============================================================================

function EmojiButton({
  emoji,
  count,
  isSelected,
  onClick,
  delay,
}: {
  emoji: string;
  count: number;
  isSelected: boolean;
  onClick: () => void;
  delay: number;
}) {
  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={isSelected}
      aria-label={`${emoji}${count > 0 ? `, ${count}` : ''}`}
      onClick={onClick}
      initial={{ opacity: 0, scale: 0, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      whileHover={{ scale: 1.3, y: -4 }}
      whileTap={{ scale: 0.8 }}
      transition={{ delay, ...SPRING }}
      className={
        isSelected
          ? 'relative flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500/25 to-teal-500/20 border border-cyan-500/50 shadow-[0_8px_24px_-8px_rgba(0,180,216,0.4)]'
          : 'relative flex items-center justify-center w-10 h-10 rounded-full bg-white/[0.06] border border-white/15 hover:bg-white/[0.12] hover:border-white/25'
      }
    >
      {/* Inner glow */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background: isSelected
            ? 'radial-gradient(circle at center, rgba(0,180,216,0.2), transparent 70%)'
            : 'linear-gradient(145deg, rgba(255,255,255,0.08), transparent)',
        }}
      />

      {/* Emoji */}
      <motion.span
        animate={isSelected ? { scale: [1, 1.2, 0.9, 1.05, 1] } : {}}
        transition={{ duration: 0.4 }}
        className="relative z-10 text-xl leading-none"
        style={{
          filter: isSelected ? 'drop-shadow(0 0 8px rgba(0,180,216,0.5))' : '',
        }}
      >
        {emoji}
      </motion.span>

      {/* Count badge */}
      {count > 0 && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: delay + 0.1, ...SPRING }}
          className={
            isSelected
              ? 'absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-gradient-to-r from-cyan-500 to-teal-500 text-white shadow-[0_4px_12px_-4px_rgba(0,180,216,0.4)]'
              : 'absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-black/60 text-white/80'
          }
        >
          {count > 999 ? `${(count / 1000).toFixed(1)}K` : count}
        </motion.span>
      )}

      {/* Selection ring animation */}
      {isSelected && (
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 0.6, repeat: Infinity }}
          className="absolute inset-0 rounded-full border-2 border-cyan-400/30 pointer-events-none"
        />
      )}
    </motion.button>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ReelReactionPicker = memo<ReelReactionPickerProps>(({
  reactionCounts,
  myReaction,
  onReaction,
}) => {
  const emojis = useMemo(() => {
    if (reactionCounts.length > 0) {
      return reactionCounts.map((r) => r.emoji);
    }
    return [...DEFAULT_EMOJIS];
  }, [reactionCounts]);

  const handleReaction = useCallback(
    (emoji: string) => onReaction(emoji),
    [onReaction],
  );

  return (
    <AnimatePresence>
      <motion.div
        className="absolute z-50 flex flex-col items-center gap-1 p-2 rounded-2xl backdrop-blur-2xl"
        style={{
          background: 'linear-gradient(180deg, rgba(30,30,40,0.95), rgba(20,20,30,0.98))',
          border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 20px 60px -20px rgba(0,0,0,0.5), 0 0 40px -20px rgba(0,180,216,0.15)',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: '8px',
        }}
        initial={{ opacity: 0, scale: 0.5, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.5, y: 20 }}
        transition={SPRING}
        role="radiogroup"
        aria-label="Выбор реакции"
      >
        {/* Top glow line */}
        <div
          className="absolute inset-x-0 top-0 h-px pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(0,180,216,0.3), transparent)',
          }}
        />

        {/* Inner highlight */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.06), transparent 50%)',
          }}
        />

        {/* Emoji grid */}
        <div className="relative flex flex-wrap justify-center max-w-[120px] gap-1">
          {emojis.map((emoji, index) => {
            const count = reactionCounts.find((r) => r.emoji === emoji)?.count ?? 0;
            const isSelected = myReaction === emoji;
            return (
              <EmojiButton
                key={emoji}
                emoji={emoji}
                count={count}
                isSelected={isSelected}
                onClick={() => handleReaction(emoji)}
                delay={index * 0.03}
              />
            );
          })}
        </div>

        {/* Ambient glow */}
        <motion.div
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 3, repeat: Infinity }}
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(0,180,216,0.1), transparent 70%)',
            filter: 'blur(8px)',
          }}
        />
      </motion.div>
    </AnimatePresence>
  );
});

ReelReactionPicker.displayName = 'ReelReactionPicker';

export { ReelReactionPicker };
