/**
 * MatchOverlay — анимация "Это взаимно!" при мэтче.
 *
 * Фото обоих, confetti-подобная анимация, кнопки "Написать" / "Продолжить".
 */

import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Heart } from 'lucide-react';
import { type DatingProfile } from '@/hooks/useDating';

interface MatchOverlayProps {
  profile: DatingProfile | null;
  onClose: () => void;
}

export function MatchOverlay({ profile, onClose }: MatchOverlayProps) {
  const navigate = useNavigate();

  const handleMessage = () => {
    if (profile) {
      navigate(`/chat/${profile.user_id}`);
    }
    onClose();
  };

  return (
    <AnimatePresence>
      {profile && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className="flex flex-col items-center gap-6 px-8"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Взаимный лайк"
          >
            {/* Confetti-like particles */}
            <ConfettiParticles />

            {/* Heart icon */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.3, 1] }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              <Heart className="w-16 h-16 text-pink-500 fill-pink-500" />
            </motion.div>

            {/* Title */}
            <motion.h2
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-white text-3xl font-bold text-center"
            >
              Это взаимно! 🎉
            </motion.h2>

            {/* Profile photo */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="flex items-center gap-4"
            >
              <div className="w-20 h-20 rounded-full overflow-hidden border-3 border-pink-500 bg-zinc-700">
                {profile.photos[0] ? (
                  <img loading="lazy"
                    src={profile.photos[0]}
                    alt={profile.display_name ?? 'Партнёр'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl">
                    👤
                  </div>
                )}
              </div>
            </motion.div>

            <motion.p
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-zinc-400 text-sm text-center"
            >
              Вы понравились друг другу.{' '}
              {profile.display_name && `Напишите ${profile.display_name}!`}
            </motion.p>

            {/* Actions */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="flex gap-3 w-full max-w-[280px]"
            >
              <button
                onClick={handleMessage}
                className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold py-3.5 rounded-xl active:scale-95 transition-transform min-h-[44px]"
              >
                <MessageSquare className="w-5 h-5" />
                Написать
              </button>
              <button
                onClick={onClose}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-3.5 rounded-xl transition-colors min-h-[44px]"
              >
                Продолжить
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// ConfettiParticles — лёгкая анимация "конфетти"
// ---------------------------------------------------------------------------

function ConfettiParticles() {
  const colors = ['bg-pink-500', 'bg-purple-500', 'bg-yellow-400', 'bg-blue-400', 'bg-green-400'];

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: 20 }).map((_, i) => {
        const color = colors[i % colors.length];
        const left = `${10 + Math.random() * 80}%`;
        const delay = Math.random() * 0.5;
        const duration = 1 + Math.random() * 1.5;
        const size = 4 + Math.random() * 6;

        return (
          <motion.div
            key={i}
            className={`absolute rounded-full ${color}`}
            style={{
              width: size,
              height: size,
              left,
              top: '40%',
            }}
            initial={{ opacity: 0, y: 0, scale: 0 }}
            animate={{
              opacity: [0, 1, 0],
              y: [0, -150 - Math.random() * 200],
              x: [-30 + Math.random() * 60],
              scale: [0, 1, 0.5],
              rotate: [0, 360],
            }}
            transition={{
              delay,
              duration,
              ease: 'easeOut',
            }}
          />
        );
      })}
    </div>
  );
}
