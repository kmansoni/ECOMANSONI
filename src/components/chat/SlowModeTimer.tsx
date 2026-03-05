/**
 * SlowModeTimer — visual countdown overlay on the send button / textarea.
 * Shows remaining seconds in a circular badge when slow mode is active.
 */

import { motion, AnimatePresence } from "framer-motion";

interface SlowModeTimerProps {
  remainingSeconds: number;
  delaySeconds: number;
}

export function SlowModeTimer({ remainingSeconds, delaySeconds }: SlowModeTimerProps) {
  if (remainingSeconds <= 0) return null;

  const progress = 1 - remainingSeconds / delaySeconds;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-500/20 border border-orange-500/30"
      >
        <div className="relative w-4 h-4">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="6" fill="none" stroke="rgba(251,146,60,0.3)" strokeWidth="2" />
            <circle
              cx="8" cy="8" r="6" fill="none" stroke="rgb(251,146,60)" strokeWidth="2"
              strokeDasharray={`${2 * Math.PI * 6}`}
              strokeDashoffset={`${2 * Math.PI * 6 * (1 - progress)}`}
              transform="rotate(-90 8 8)"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <span className="text-xs font-mono text-orange-400 font-medium">
          {remainingSeconds}с
        </span>
      </motion.div>
    </AnimatePresence>
  );
}
