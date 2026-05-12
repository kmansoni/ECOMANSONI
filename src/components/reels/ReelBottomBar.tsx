/**
 * @file src/components/reels/ReelBottomBar.tsx
 * @description Нижняя панель Reel: описание, музыка, комментарии, кнопка ввода.
 * Instagram Premium стиль — полупрозрачный бэкграунд, расширяемая область описания.
 */

import React, { memo, useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Music, MessageCircle, Send, Smile, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReelAuthor, ReelFeedItem } from '@/types/reels';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReelBottomBarProps {
  reel: ReelFeedItem;
  isOverlayVisible: boolean;
  onAuthorPress: (authorId: string) => void;
  onHashtagPress: (hashtag: string) => void;
  onMusicPress: (musicTitle: string) => void;
  onCommentOpen: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Текст описания с раскрытием */
const DescriptionText = memo<{
  description: string;
  hashtags: string[];
  onHashtagPress: (tag: string) => void;
}>(({ description, hashtags, onHashtagPress }) => {
  const [expanded, setExpanded] = useState(false);
  const maxLength = 120;
  const isLong = description.length > maxLength;
  const displayText = expanded ? description : description.slice(0, maxLength);

  const handleHashtag = useCallback(
    (tag: string) => () => onHashtagPress(tag),
    [onHashtagPress],
  );

  // Парсим хэштеги из текста
  const renderContent = (text: string) => {
    const parts = text.split(/(#\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('#')) {
        return (
          <button
            key={i}
            type="button"
            onClick={handleHashtag(part.slice(1))}
            className="text-blue-400 hover:underline"
          >
            {part}
          </button>
        );
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  };

  return (
    <div className="text-sm text-white leading-5 mb-1">
      <p className="whitespace-pre-wrap">
        {renderContent(displayText)}
        {isLong && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-white/60 text-xs ml-1 hover:text-white"
          >
            …ещё
          </button>
        )}
      </p>
    </div>
  );
});
DescriptionText.displayName = 'DescriptionText';

/** Бейдж музыки */
const MusicBadge = memo<{
  title: string | null;
  artist: string | null;
  onPress: () => void;
}>(({ title, artist, onPress }) => {
  if (!title && !artist) return null;

  return (
    <button
      type="button"
      onClick={onPress}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 active:bg-white/20 transition-colors"
    >
      <Music size={12} className="text-white animate-pulse-slow" />
      <span className="text-white text-xs font-medium truncate max-w-[140px]">
        {title}
        {artist && ` · ${artist}`}
      </span>
    </button>
  );
});
MusicBadge.displayName = 'MusicBadge';

/**
 * Стиль пульсации — добавляется один раз при монтировании
 */
function usePulseAnimation() {
  useEffect(() => {
    if (document.querySelector('#pulse-slow-style')) return;
    const style = document.createElement('style');
    style.id = 'pulse-slow-style';
    style.textContent = `
      @keyframes pulse-slow {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.7; transform: scale(1.1); }
      }
      .animate-pulse-slow {
        animation: pulse-slow 2s ease-in-out infinite;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.querySelector('#pulse-slow-style')?.remove();
    };
  }, []);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const ReelBottomBar = memo<ReelBottomBarProps>(({
  reel,
  isOverlayVisible,
  onAuthorPress,
  onHashtagPress,
  onMusicPress,
  onCommentOpen,
  className,
}) => {
  usePulseAnimation();
  const [inputFocused, setInputFocused] = useState(false);

  const handleAuthorPress = useCallback(
    () => onAuthorPress(reel.author.id),
    [onAuthorPress, reel.author.id],
  );

  const handleCommentOpen = useCallback(() => {
    onCommentOpen();
  }, [onCommentOpen]);

  return (
    <motion.div
      className={cn(
        'absolute bottom-0 left-0 right-0 z-20 pb-safe-bottom',
        className,
      )}
      initial={false}
      animate={{
        opacity: isOverlayVisible ? 1 : 0,
        y: isOverlayVisible ? 0 : 20,
        pointerEvents: isOverlayVisible ? 'auto' : 'none',
      }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      {/* Градиент поверх */}
      <div className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />

      <div className="relative z-10 px-3 space-y-2">
        {/* Автор и описание */}
        <div className="flex items-start gap-2">
          {/* Аватар */}
          <button
            type="button"
            onClick={handleAuthorPress}
            className="flex-shrink-0 w-8 h-8 rounded-full border border-white/30 overflow-hidden ring-1 ring-white/20"
            aria-label={`Профиль @${reel.author.username}`}
          >
            {reel.author.avatar_url ? (
              <img
                src={reel.author.avatar_url}
                alt={reel.author.username}
                className="w-full h-full object-cover"
                loading="lazy"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full bg-neutral-700 flex items-center justify-center">
                <span className="text-white text-xs font-bold">
                  {reel.author.username.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleAuthorPress}
                className="text-white font-semibold text-sm hover:opacity-90 truncate"
              >
                @{reel.author.username}
              </button>
              {reel.author.is_verified && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-blue-400 flex-shrink-0">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                </svg>
              )}
            </div>
            {reel.description && (
              <DescriptionText
                description={reel.description}
                hashtags={reel.hashtags ?? []}
                onHashtagPress={onHashtagPress}
              />
            )}
            {/* Музыка */}
            <MusicBadge
              title={reel.music_title}
              artist={reel.music_artist ?? null}
              onPress={() => reel.music_title && onMusicPress(reel.music_title)}
            />
          </div>
        </div>

        {/* Панель ввода комментария */}
        <div className={cn(
          'flex items-center gap-2 bg-white/10 backdrop-blur-md rounded-full px-3 py-1.5',
          'border border-white/10 transition-all duration-200',
          inputFocused && 'bg-white/15 border-white/25',
        )}>
          <Smile size={16} className="text-white/50 flex-shrink-0" />
          <input
            type="text"
            placeholder="Добавить комментарий..."
            className="flex-1 bg-transparent text-white text-sm placeholder-white/40 outline-none"
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            onClick={handleCommentOpen}
            readOnly
            aria-label="Комментарий"
          />
          <motion.button
            type="button"
            whileTap={{ scale: 0.85 }}
            className="flex-shrink-0 w-7 h-7 rounded-full bg-white/20 flex items-center justify-center"
            onClick={handleCommentOpen}
            aria-label="Отправить"
          >
            <Send size={14} className="text-white" />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
});

ReelBottomBar.displayName = 'ReelBottomBar';

export { ReelBottomBar };
export type { ReelBottomBarProps };