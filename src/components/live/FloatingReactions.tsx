import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { LiveReaction } from '@/types/livestream';

interface FloatingReactionsProps {
  reactions: LiveReaction[];
}

/**
 * Renders up to 20 ephemeral emoji reactions animating from bottom to top.
 * Each reaction fades in, floats upward, fades out using CSS transforms only.
 * Framer Motion + requestAnimationFrame-based.
 */
export const FloatingReactions = React.memo(function FloatingReactions({
  reactions,
}: FloatingReactionsProps) {
  const visible = useMemo(() => reactions.slice(-20), [reactions]);

  return (
    <div
      className="pointer-events-none absolute bottom-36 right-4 flex flex-col-reverse gap-1"
      style={{ width: 48 }}
      aria-hidden="true"
    >
      <AnimatePresence>
        {visible.map((r) => {
          const offsetX = Math.round((Math.random() - 0.5) * 28);
          return (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 0, scale: 0.5, x: offsetX }}
              animate={{ opacity: 1, y: -80, scale: 1.2, x: offsetX }}
              exit={{ opacity: 0, y: -140, scale: 0.8, x: offsetX }}
              transition={{ duration: 2.5, ease: 'easeOut' }}
              className="text-2xl leading-none select-none"
              style={{ willChange: 'transform, opacity' }}
            >
              {r.type}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
});
