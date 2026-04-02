import { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type MessageEffectType = 'confetti' | 'fire' | 'hearts' | 'thumbsup';

const EFFECT_DURATION_MS = 2500;

const EFFECT_PARTICLES: Record<MessageEffectType, { emoji: string; count: number }> = {
  confetti: { emoji: '🎉', count: 30 },
  fire: { emoji: '🔥', count: 20 },
  hearts: { emoji: '❤️', count: 25 },
  thumbsup: { emoji: '👍', count: 15 },
};

interface Particle {
  id: number;
  x: number;
  y: number;
  emoji: string;
  size: number;
  delay: number;
  duration: number;
}

function generateParticles(effect: MessageEffectType): Particle[] {
  const { emoji, count } = EFFECT_PARTICLES[effect];
  const emojis = effect === 'confetti'
    ? ['🎉', '🎊', '✨', '🌟', '💫', '🎈']
    : [emoji];

  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 30,
    emoji: emojis[Math.floor(Math.random() * emojis.length)],
    size: 16 + Math.random() * 20,
    delay: Math.random() * 0.6,
    duration: 1.2 + Math.random() * 1.0,
  }));
}

interface MessageEffectOverlayProps {
  effect: MessageEffectType | null;
  onComplete: () => void;
}

export function MessageEffectOverlay({ effect, onComplete }: MessageEffectOverlayProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleComplete = useCallback(() => {
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    if (!effect) return;
    timerRef.current = setTimeout(handleComplete, EFFECT_DURATION_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [effect, handleComplete]);

  if (!effect) return null;

  const particles = generateParticles(effect);

  return (
    <AnimatePresence>
      <motion.div
        key={effect}
        className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden"
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        {particles.map((p) => (
          <motion.span
            key={p.id}
            className="absolute select-none"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              fontSize: p.size,
            }}
            initial={{ opacity: 1, y: 0, scale: 0.3 }}
            animate={{
              opacity: [1, 1, 0],
              y: [0, window.innerHeight * 0.7],
              scale: [0.3, 1.2, 0.8],
              rotate: [0, (Math.random() - 0.5) * 360],
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              ease: 'easeOut',
            }}
          >
            {p.emoji}
          </motion.span>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}

export function isValidMessageEffect(value: unknown): value is MessageEffectType {
  return typeof value === 'string' && value in EFFECT_PARTICLES;
}
