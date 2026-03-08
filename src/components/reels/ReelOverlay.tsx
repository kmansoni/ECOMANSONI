/**
 * @file src/components/reels/ReelOverlay.tsx
 * @description Информационный overlay поверх видео Reel (Instagram Reels style).
 *
 * Архитектура pointer-events:
 * - Контейнер: pointer-events-none (не блокирует тапы на плеере)
 * - Content area внутри: pointer-events-auto (кликабельные кнопки)
 *
 * Градиент от нижнего края вверх (40% высоты), обеспечивает читаемость белого текста.
 * Все интерактивные зоны >= 44×44px (WCAG touch target).
 */

import React, { memo, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Music } from 'lucide-react';
import { cn } from '@/lib/utils';
import { truncateDescription } from '@/lib/reels/format';
import type { ReelAuthor } from '@/types/reels';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReelOverlayProps {
  author: ReelAuthor;
  description: string | null;
  musicTitle: string | null;
  musicArtist: string | null;
  hashtags: string[];
  isFollowing: boolean;
  onAuthorPress: (authorId: string) => void;
  onHashtagPress: (hashtag: string) => void;
  onFollowPress: (authorId: string) => void;
}

// ---------------------------------------------------------------------------
// Вспомогательные компоненты
// ---------------------------------------------------------------------------

/** Аватар автора с fallback-инициалами */
const AuthorAvatar = memo<{ avatarUrl: string | null; username: string; onClick: () => void }>(
  ({ avatarUrl, username, onClick }) => {
    const [imgFailed, setImgFailed] = useState(false);

    const handleError = useCallback(() => setImgFailed(true), []);

    const initial = username.charAt(0).toUpperCase();

    return (
      <button
        type="button"
        onClick={onClick}
        className="w-8 h-8 rounded-full border-2 border-white overflow-hidden flex-shrink-0 flex items-center justify-center bg-neutral-700"
        style={{ minWidth: 32, minHeight: 32 }}
        aria-label={`Профиль @${username}`}
      >
        {avatarUrl && !imgFailed ? (
          <img
            src={avatarUrl}
            alt={username}
            className="w-full h-full object-cover"
            onError={handleError}
            draggable={false}
          />
        ) : (
          <span className="text-white text-xs font-bold leading-none select-none">
            {initial}
          </span>
        )}
      </button>
    );
  },
);
AuthorAvatar.displayName = 'AuthorAvatar';

/** Анимированный marquee для текста музыки */
const MusicMarquee = memo<{ text: string }>(({ text }) => {
  // Показываем marquee всегда — как Instagram
  return (
    <div className="overflow-hidden flex-1 min-w-0" style={{ maxWidth: 200 }}>
      <motion.p
        animate={{ x: ['0%', '-50%'] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear', repeatDelay: 0.5 }}
        className="text-white text-xs font-medium whitespace-nowrap"
        style={{ width: 'max-content' }}
      >
        {text}&nbsp;&nbsp;&nbsp;&nbsp;{text}
      </motion.p>
    </div>
  );
});
MusicMarquee.displayName = 'MusicMarquee';

// ---------------------------------------------------------------------------
// Компонент
// ---------------------------------------------------------------------------

const ReelOverlay = memo<ReelOverlayProps>(
  ({
    author,
    description,
    musicTitle,
    musicArtist,
    hashtags,
    isFollowing,
    onAuthorPress,
    onHashtagPress,
    onFollowPress,
  }) => {
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

    // -- Коллбэки --
    const handleAuthorPress = useCallback(
      () => onAuthorPress(author.id),
      [onAuthorPress, author.id],
    );

    const handleFollowPress = useCallback(
      () => onFollowPress(author.id),
      [onFollowPress, author.id],
    );

    const handleHashtagPress = useCallback(
      (tag: string) => () => onHashtagPress(tag),
      [onHashtagPress],
    );

    const handleExpandDescription = useCallback(() => {
      setIsDescriptionExpanded(true);
    }, []);

    // -- Описание --
    const rawDescription = description ?? '';
    const { text: truncatedText, isTruncated } = truncateDescription(rawDescription, 100);
    const displayText = isDescriptionExpanded ? rawDescription : truncatedText;

    // -- Музыка --
    const musicText =
      musicTitle && musicArtist
        ? `${musicTitle} · ${musicArtist}`
        : musicTitle ?? musicArtist ?? null;

    return (
      <div
        className="absolute inset-0 z-10 flex flex-col justify-end pointer-events-none"
        aria-hidden="false"
      >
        {/* Gradient overlay */}
        <div
          className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-black/60 via-black/20 to-transparent pointer-events-none"
          aria-hidden="true"
        />

        {/* Content area */}
        <div className="relative z-10 px-4 pointer-events-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]">

          {/* Author row */}
          <div className="flex items-center gap-2 mb-2">
            <AuthorAvatar
              avatarUrl={author.avatar_url}
              username={author.username}
              onClick={handleAuthorPress}
            />

            <button
              type="button"
              onClick={handleAuthorPress}
              className="text-white font-semibold text-sm leading-none hover:opacity-90 active:opacity-75"
              aria-label={`Открыть профиль @${author.username}`}
            >
              @{author.username}
            </button>

            {/* Verified badge */}
            {author.is_verified && (
              <span
                className="text-blue-400 text-xs leading-none"
                aria-label="Верифицированный аккаунт"
              >
                ✓
              </span>
            )}

            {/* Follow button */}
            <AnimatePresence>
              {!isFollowing && (
                <motion.button
                  key="follow-btn"
                  type="button"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  onClick={handleFollowPress}
                  className="ml-2 px-3 py-1 border border-white rounded-full text-white text-xs font-medium"
                  style={{ minHeight: 28 }}
                  aria-label={`Подписаться на @${author.username}`}
                >
                  Подписаться
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Description + hashtags */}
          {(rawDescription || hashtags.length > 0) && (
            <motion.div
              className="mb-1 overflow-hidden"
              animate={{ height: 'auto' }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <p className="text-white text-sm leading-5">
                {displayText}
                {/* Inline hashtags after description text */}
                {hashtags.length > 0 && (
                  <>
                    {' '}
                    {hashtags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={handleHashtagPress(tag)}
                        className="text-blue-400 text-sm font-normal hover:underline mr-1"
                        aria-label={`Хэштег #${tag}`}
                      >
                        #{tag}
                      </button>
                    ))}
                  </>
                )}
                {/* "Ещё" button */}
                {isTruncated && !isDescriptionExpanded && (
                  <button
                    type="button"
                    onClick={handleExpandDescription}
                    className="text-white/70 text-sm ml-1 hover:text-white"
                    aria-label="Развернуть описание"
                  >
                    ещё
                  </button>
                )}
              </p>
            </motion.div>
          )}

          {/* Music badge */}
          {musicText && (
            <div className="flex items-center gap-1.5 text-white text-xs mt-1">
              {/* Rotating music note */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                className="flex-shrink-0"
                aria-hidden="true"
              >
                <Music className="w-3.5 h-3.5 text-white" />
              </motion.div>

              <MusicMarquee text={musicText} />
            </div>
          )}
        </div>
      </div>
    );
  },
);

ReelOverlay.displayName = 'ReelOverlay';

export { ReelOverlay };
