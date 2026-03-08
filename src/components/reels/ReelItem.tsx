/**
 * @file src/components/reels/ReelItem.tsx
 * @description Контейнер одного Reel — одна «страница» вертикального фида.
 *
 * Ответственность:
 * - Компонует ReelPlayer + ReelOverlay + placeholder для ReelSidebar (Phase 3)
 * - Управляет state double-tap сердца (TapPosition | null)
 * - Проксирует isActive в ReelPlayer
 * - Проксирует данные автора / описания / музыки в ReelOverlay
 *
 * Double-tap flow:
 *   ReelPlayer.onDoubleTap(pos) → setHeartPosition(pos) + onLike(reel.id)
 *   ReelDoubleTapHeart.onAnimationComplete → setHeartPosition(null)
 *
 * Layout: 100vw × 100dvh, snap-start snap-always (для CSS scroll snap).
 * Не overflow:scroll — прокрутка управляется родительским контейнером.
 */

import React, { memo, useCallback, useState } from 'react';
import { ReelPlayer } from './ReelPlayer';
import { ReelOverlay } from './ReelOverlay';
import { ReelDoubleTapHeart } from './ReelDoubleTapHeart';
import { ReelSidebar } from './ReelSidebar';
import { useReelsContext } from '@/contexts/ReelsContext';
import type { ReelFeedItem, TapPosition } from '@/types/reels';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReelItemProps {
  reel: ReelFeedItem;
  /**
   * true когда этот Reel виден в viewport (IntersectionObserver на уровне страницы).
   * Пробрасывается в ReelPlayer для управления autoplay / pause.
   */
  isActive: boolean;
  onLike: (reelId: string) => void;
  onSave: (reelId: string) => void;
  onRepost: (reelId: string) => void;
  onShare: (reelId: string) => void;
  onComment: (reelId: string) => void;
  onAuthorPress: (authorId: string) => void;
  onHashtagPress: (hashtag: string) => void;
  onFollowPress: (authorId: string) => void;
}

// ---------------------------------------------------------------------------
// Компонент
// ---------------------------------------------------------------------------

const ReelItem = memo<ReelItemProps>(
  ({
    reel,
    isActive,
    onLike,
    onSave,
    onRepost,
    onShare,
    onComment,
    onAuthorPress,
    onHashtagPress,
    onFollowPress,
  }) => {
    // Позиция double-tap сердца (null = анимация не активна)
    const [heartPosition, setHeartPosition] = useState<TapPosition | null>(null);

    const { isMuted, toggleMute } = useReelsContext();

    // ---------------------------------------------------------------------------
    // Callbacks
    // ---------------------------------------------------------------------------

    /**
     * Вызывается ReelPlayer при double-tap.
     * Одновременно показываем сердце и проставляем лайк.
     */
    const handleDoubleTap = useCallback(
      (position: TapPosition) => {
        setHeartPosition(position);
        onLike(reel.id);
      },
      [onLike, reel.id],
    );

    /** Сердце завершило анимацию → скрываем */
    const handleHeartAnimationComplete = useCallback(() => {
      setHeartPosition(null);
    }, []);

    const handleLike = useCallback(() => onLike(reel.id), [onLike, reel.id]);
    const handleSave = useCallback(() => onSave(reel.id), [onSave, reel.id]);
    const handleRepost = useCallback(() => onRepost(reel.id), [onRepost, reel.id]);
    const handleShare = useCallback(() => onShare(reel.id), [onShare, reel.id]);
    const handleComment = useCallback(() => onComment(reel.id), [onComment, reel.id]);
    const handleMore = useCallback(() => { /* Phase 4: откроет dropdown/sheet */ }, []);

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------

    return (
      <div
        className="relative w-full h-[100dvh] bg-black overflow-hidden snap-start snap-always"
        data-reel-id={reel.id}
        data-reel-active={isActive}
      >
        {/* ----------------------------------------------------------------
            Видеоплеер — занимает весь контейнер
        ---------------------------------------------------------------- */}
        <ReelPlayer
          videoUrl={reel.video_url}
          thumbnailUrl={reel.thumbnail_url}
          isActive={isActive}
          onDoubleTap={handleDoubleTap}
          className="absolute inset-0 w-full h-full"
        />

        {/* ----------------------------------------------------------------
            Overlay с информацией (автор, описание, музыка)
        ---------------------------------------------------------------- */}
        <ReelOverlay
          author={reel.author}
          description={reel.description}
          musicTitle={reel.music_title}
          musicArtist={reel.music_artist}
          hashtags={reel.hashtags}
          isFollowing={reel.author.is_following}
          onAuthorPress={onAuthorPress}
          onHashtagPress={onHashtagPress}
          onFollowPress={onFollowPress}
        />

        {/* ----------------------------------------------------------------
            ReelSidebar — кнопки действий (Phase 3)
        ---------------------------------------------------------------- */}
        <ReelSidebar
          reelId={reel.id}
          metrics={reel.metrics}
          isLiked={reel.is_liked}
          isSaved={reel.is_saved}
          isReposted={reel.is_reposted}
          authorAvatarUrl={reel.author.avatar_url}
          onLike={handleLike}
          onComment={handleComment}
          onShare={handleShare}
          onSave={handleSave}
          onRepost={handleRepost}
          onMore={handleMore}
          onMuteToggle={toggleMute}
          isMuted={isMuted}
        />

        {/* ----------------------------------------------------------------
            Double-tap heart animation — абсолютно поверх всего
        ---------------------------------------------------------------- */}
        <ReelDoubleTapHeart
          position={heartPosition}
          onAnimationComplete={handleHeartAnimationComplete}
        />
      </div>
    );
  },
);

ReelItem.displayName = 'ReelItem';

export { ReelItem };
