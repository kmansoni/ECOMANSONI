/**
 * SwipeCard — анимированная карточка знакомств.
 *
 * Фото, имя, возраст, интересы. Свайп влево = dislike, вправо = like, вверх = superlike.
 * Framer-motion drag + spring анимация.
 */

import { useRef } from 'react';
import { motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import { Heart, X, Star, MapPin } from 'lucide-react';
import { type DatingProfile } from '@/hooks/useDating';

interface SwipeCardProps {
  profile: DatingProfile;
  onSwipe: (direction: 'like' | 'dislike' | 'superlike') => void;
  isTop: boolean;
  stackIndex: number;
}

const SWIPE_THRESHOLD = 100;
const SUPERLIKE_THRESHOLD = -80;

export function SwipeCard({ profile, onSwipe, isTop, stackIndex }: SwipeCardProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotate = useTransform(x, [-200, 0, 200], [-15, 0, 15]);
  const likeOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const nopeOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);
  const superlikeOpacity = useTransform(y, [SUPERLIKE_THRESHOLD, 0], [1, 0]);

  const cardScale = 1 - stackIndex * 0.05;
  const cardY = stackIndex * 8;

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y < SUPERLIKE_THRESHOLD && Math.abs(info.offset.x) < 60) {
      onSwipe('superlike');
      return;
    }
    if (info.offset.x > SWIPE_THRESHOLD) {
      onSwipe('like');
      return;
    }
    if (info.offset.x < -SWIPE_THRESHOLD) {
      onSwipe('dislike');
      return;
    }
  };

  const currentPhoto = profile.photos.length > 0 ? profile.photos[0] : null;

  return (
    <motion.div
      className="absolute inset-0 touch-none"
      style={{
        x: isTop ? x : 0,
        y: isTop ? y : cardY,
        rotate: isTop ? rotate : 0,
        scale: cardScale,
        zIndex: 10 - stackIndex,
      }}
      drag={isTop}
      dragConstraints={{ top: -200, bottom: 0, left: -300, right: 300 }}
      dragElastic={0.7}
      onDragEnd={isTop ? handleDragEnd : undefined}
      whileDrag={{ cursor: 'grabbing' }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <div className="relative w-full h-full rounded-2xl overflow-hidden bg-zinc-800 shadow-xl select-none">
        {/* Фото */}
        {currentPhoto ? (
          <img
            src={currentPhoto}
            alt={profile.display_name ?? 'Фото анкеты'}
            className="w-full h-full object-cover pointer-events-none"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-zinc-700 to-zinc-900 flex items-center justify-center">
            <span className="text-6xl">👤</span>
          </div>
        )}

        {/* Градиент */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

        {/* LIKE оверлей */}
        {isTop && (
          <motion.div
            className="absolute top-8 left-8 border-4 border-green-400 rounded-xl px-4 py-2 rotate-[-15deg] pointer-events-none"
            style={{ opacity: likeOpacity }}
          >
            <span className="text-green-400 text-3xl font-bold">LIKE</span>
          </motion.div>
        )}

        {/* NOPE оверлей */}
        {isTop && (
          <motion.div
            className="absolute top-8 right-8 border-4 border-red-400 rounded-xl px-4 py-2 rotate-[15deg] pointer-events-none"
            style={{ opacity: nopeOpacity }}
          >
            <span className="text-red-400 text-3xl font-bold">NOPE</span>
          </motion.div>
        )}

        {/* SUPER LIKE оверлей */}
        {isTop && (
          <motion.div
            className="absolute top-1/3 left-1/2 -translate-x-1/2 pointer-events-none"
            style={{ opacity: superlikeOpacity }}
          >
            <Star className="w-16 h-16 text-blue-400 fill-blue-400" />
          </motion.div>
        )}

        {/* Информация */}
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <div className="flex items-end gap-2">
            <h3 className="text-white text-2xl font-bold leading-tight">
              {profile.display_name ?? 'Аноним'}
            </h3>
            {profile.age > 0 && (
              <span className="text-white/80 text-xl">{profile.age}</span>
            )}
          </div>

          {profile.distance_km !== undefined && profile.distance_km > 0 && (
            <div className="flex items-center gap-1 mt-1 text-white/60 text-sm">
              <MapPin className="w-3.5 h-3.5" />
              <span>{profile.distance_km} км</span>
            </div>
          )}

          {profile.bio && (
            <p className="text-white/70 text-sm mt-2 line-clamp-2">{profile.bio}</p>
          )}

          {profile.interests.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {profile.interests.slice(0, 5).map(interest => (
                <span
                  key={interest}
                  className="bg-white/20 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full"
                >
                  {interest}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Action buttons (для нижней панели)
// ---------------------------------------------------------------------------

interface ActionButtonsProps {
  onDislike: () => void;
  onLike: () => void;
  onSuperlike: () => void;
  disabled?: boolean;
}

export function SwipeActionButtons({ onDislike, onLike, onSuperlike, disabled }: ActionButtonsProps) {
  return (
    <div className="flex items-center justify-center gap-5">
      <button
        onClick={onDislike}
        disabled={disabled}
        className="w-14 h-14 rounded-full bg-zinc-800 border-2 border-red-500/40 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-50"
        aria-label="Не нравится"
      >
        <X className="w-7 h-7 text-red-400" />
      </button>

      <button
        onClick={onSuperlike}
        disabled={disabled}
        className="w-12 h-12 rounded-full bg-zinc-800 border-2 border-blue-500/40 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-50"
        aria-label="Суперлайк"
      >
        <Star className="w-6 h-6 text-blue-400" />
      </button>

      <button
        onClick={onLike}
        disabled={disabled}
        className="w-14 h-14 rounded-full bg-zinc-800 border-2 border-green-500/40 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-50"
        aria-label="Нравится"
      >
        <Heart className="w-7 h-7 text-green-400" />
      </button>
    </div>
  );
}
