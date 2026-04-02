/**
 * SwipeStack — стек из 3 карточек с анимацией свайпа.
 *
 * Top card = swipeable, остальные — фоновый parallax.
 * Empty state: "Больше нет анкет рядом".
 */

import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart, Loader2, RefreshCw } from 'lucide-react';
import { SwipeCard, SwipeActionButtons } from './SwipeCard';
import { MatchOverlay } from './MatchOverlay';
import { type DatingProfile } from '@/hooks/useDating';

interface SwipeStackProps {
  cards: DatingProfile[];
  onSwipe: (userId: string, direction: 'like' | 'dislike' | 'superlike') => Promise<{ matched: boolean }>;
  loading: boolean;
  onRefresh: () => void;
}

const VISIBLE_STACK = 3;

export function SwipeStack({ cards, onSwipe, loading, onRefresh }: SwipeStackProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [matchProfile, setMatchProfile] = useState<DatingProfile | null>(null);
  const [swiping, setSwiping] = useState(false);

  const visibleCards = cards.slice(currentIndex, currentIndex + VISIBLE_STACK);
  const currentCard = visibleCards[0];

  const handleSwipe = useCallback(async (direction: 'like' | 'dislike' | 'superlike') => {
    if (!currentCard || swiping) return;

    setSwiping(true);
    try {
      const result = await onSwipe(currentCard.user_id, direction);
      setCurrentIndex(prev => prev + 1);

      if (result.matched) {
        setMatchProfile(currentCard);
      }
    } finally {
      setSwiping(false);
    }
  }, [currentCard, onSwipe, swiping]);

  const handleCloseMatch = useCallback(() => {
    setMatchProfile(null);
  }, []);

  // Loading
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 text-pink-400 animate-spin" />
        <p className="text-zinc-400 text-sm">Ищем анкеты рядом...</p>
      </div>
    );
  }

  // Empty state
  if (visibleCards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center">
          <Heart className="w-10 h-10 text-zinc-600" />
        </div>
        <p className="text-zinc-400 text-sm font-medium">Больше нет анкет рядом</p>
        <p className="text-zinc-600 text-xs text-center px-8">
          Попробуйте изменить фильтры или вернуться позже
        </p>
        <button
          onClick={onRefresh}
          className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium px-5 py-3 rounded-xl transition-colors min-h-[44px]"
          aria-label="Обновить список"
        >
          <RefreshCw className="w-4 h-4" />
          Обновить
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Карточки */}
      <div className="relative w-full max-w-[340px] aspect-[3/4]">
        <AnimatePresence>
          {visibleCards.map((profile, index) => (
            <SwipeCard
              key={profile.user_id}
              profile={profile}
              onSwipe={handleSwipe}
              isTop={index === 0}
              stackIndex={index}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Кнопки действий */}
      <SwipeActionButtons
        onDislike={() => handleSwipe('dislike')}
        onLike={() => handleSwipe('like')}
        onSuperlike={() => handleSwipe('superlike')}
        disabled={swiping || !currentCard}
      />

      {/* Match overlay */}
      <MatchOverlay
        profile={matchProfile}
        onClose={handleCloseMatch}
      />
    </div>
  );
}
