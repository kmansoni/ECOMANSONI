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
import { useNavigate } from 'react-router-dom';
import { Flag, EyeOff, Link2, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { ReelPlayer } from './ReelPlayer';
import { ReelOverlay } from './ReelOverlay';
import { ReelDoubleTapHeart } from './ReelDoubleTapHeart';
import { ReelSidebar } from './ReelSidebar';
import { ReportSheet } from '@/components/moderation/ReportSheet';
import { useReelsContext } from '@/contexts/ReelsContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
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
    const [moreOpen, setMoreOpen] = useState(false);
    const [reportOpen, setReportOpen] = useState(false);

    const { isMuted, toggleMute } = useReelsContext();
    const { user } = useAuth();
    const navigate = useNavigate();
    const isOwn = user?.id === reel.author.id;

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
    const handleMore = useCallback(() => setMoreOpen(true), []);

    const handleNotInterested = useCallback(async () => {
      setMoreOpen(false);
      const { error } = await supabase.rpc('set_reel_feedback', {
        p_reel_id: reel.id,
        p_feedback: 'not_interested',
      });
      if (error) toast.error('Не удалось скрыть');
      else toast('Рилс скрыт');
    }, [reel.id]);

    const handleCopyLink = useCallback(() => {
      setMoreOpen(false);
      const url = `${window.location.origin}/reels/${reel.id}`;
      navigator.clipboard.writeText(url).then(
        () => toast('Ссылка скопирована'),
        () => toast.error('Не удалось скопировать'),
      );
    }, [reel.id]);

    const handleDelete = useCallback(async () => {
      setMoreOpen(false);
      const { error } = await supabase.from('reels').delete().eq('id', reel.id);
      if (error) toast.error('Не удалось удалить');
      else toast('Рилс удалён');
    }, [reel.id]);

    const handleOpenReport = useCallback(() => {
      setMoreOpen(false);
      setReportOpen(true);
    }, []);

    /** Tap on music badge → navigate to AudioTrackPage */
    const handleMusicPress = useCallback(
      (musicTitle: string) => {
        navigate(`/audio/${encodeURIComponent(musicTitle)}`);
      },
      [navigate],
    );

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
          onMusicPress={handleMusicPress}
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

        {/* Action sheet */}
        <AnimatePresence>
          {moreOpen && (
            <>
              <motion.div
                className="fixed inset-0 bg-black/50 z-50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMoreOpen(false)}
              />
              <motion.div
                className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 rounded-t-2xl p-4 pb-8"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              >
                <div className="w-10 h-1 bg-zinc-600 rounded-full mx-auto mb-4" />
                <button onClick={handleNotInterested} className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-zinc-800 text-white">
                  <EyeOff size={20} /> Не интересует
                </button>
                <button onClick={handleCopyLink} className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-zinc-800 text-white">
                  <Link2 size={20} /> Скопировать ссылку
                </button>
                <button onClick={handleOpenReport} className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-zinc-800 text-red-400">
                  <Flag size={20} /> Пожаловаться
                </button>
                {isOwn && (
                  <button onClick={handleDelete} className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-zinc-800 text-red-500">
                    <Trash2 size={20} /> Удалить
                  </button>
                )}
                <button onClick={() => setMoreOpen(false)} className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-zinc-800 text-zinc-400 mt-2">
                  <X size={20} /> Отмена
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <ReportSheet
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          contentType="reel"
          contentId={reel.id}
        />
      </div>
    );
  },
);

ReelItem.displayName = 'ReelItem';

export { ReelItem };
