import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Regex: exactly 1-3 emoji characters (extended unicode) and nothing else
const SINGLE_EMOJI_REGEX = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic}){1,3}$/u;

export function isSingleEmoji(text: string): boolean {
  return SINGLE_EMOJI_REGEX.test(text.trim());
}

interface AnimatedEmojiFullscreenProps {
  /** The message text to check and animate */
  emoji: string | null;
  /** Called when animation completes */
  onComplete?: () => void;
}

export function AnimatedEmojiFullscreen({ emoji, onComplete }: AnimatedEmojiFullscreenProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (emoji && isSingleEmoji(emoji)) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        onComplete?.();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [emoji, onComplete]);

  return (
    <AnimatePresence>
      {visible && emoji && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.span
            className="text-[120px] leading-none select-none"
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{
              scale: [0.3, 1.3, 1.0],
              opacity: [0, 1, 1],
              rotate: [0, -5, 5, 0],
            }}
            exit={{ scale: 2, opacity: 0 }}
            transition={{
              duration: 0.6,
              times: [0, 0.5, 1],
              ease: "easeOut",
            }}
          >
            {emoji.trim()}
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
