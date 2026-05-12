/**
 * @file src/components/reels/ReelItem.tsx
 * @description Контейнер одного Reel — полная интеграция Premium UI.
 * Топ-бар, боттам-бар, реакции, long-press, PiP, всё как Telegram/Instagram Premium.
 */

import React, { memo, useCallback, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Flag, Link2, MessageCircle, EyeOff, Heart } from 'lucide-react';
import { toast } from 'sonner';
import { ReelPlayer } from './ReelPlayer';
import { ReelOverlay } from './ReelOverlay';
import { ReelDoubleTapHeart } from './ReelDoubleTapHeart';
import { ReelSidebar } from './ReelSidebar';
import { ReelReactionPicker } from './ReelReactionPicker';
import { ReportSheet } from '@/components/moderation/ReportSheet';
import { useReelsContext } from '@/contexts/ReelsContext';
import { useAuth } from '@/hooks/useAuth';
import { useReactions } from '@/hooks/useReactions';
import { useFollow } from '@/hooks/useFollow';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { ReelFeedItem, TapPosition } from '@/types/reels';
import type { ReactionCount } from '@/types/reels/premium';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReelItemProps {
  reel: ReelFeedItem;
  /** true когда этот Reel активен в viewport */
  isActive: boolean;
  onLike: (reelId: string) => void;
  onSave: (reelId: string) => void;
  onRepost: (reelId: string) => void;
  onShare: (reelId: string) => void;
  onComment: (reelId: string) => void;
  onAuthorPress: (username: string) => void;
  onHashtagPress: (hashtag: string) => void;
  onFollowPress?: (authorId: string) => void;
  /** Набор реакций */
  reactionCounts?: ReactionCount[];
  /** Текущая реакция пользователя */
  myReaction?: string | null;
  /** Callback при выборе реакции */
  onReactionChange?: (reelId: string, emoji: string) => void;
  /** Callback при удалении рилса автором */
  onDelete?: (reelId: string) => void;
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
    reactionCounts = [],
    myReaction = null,
    onReactionChange,
    onDelete,
  }) => {
    const [heartPosition, setHeartPosition] = useState<TapPosition | null>(null);
    const [moreOpen, setMoreOpen] = useState(false);
    const [reportOpen, setReportOpen] = useState(false);
    const [showReactionPicker, setShowReactionPicker] = useState(false);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const { isMuted, toggleMute } = useReelsContext();
    const { user } = useAuth();
    const navigate = useNavigate();
    const isOwn = user?.id === reel.author.id;

    const { isFollowing, toggle: toggleFollow, loading: followLoading } = useFollow(reel.author.id);
    const isCurrentlyFollowing = user?.id === reel.author.id ? true : isFollowing;
    const isFollowingRef = useRef(isFollowing);
    useEffect(() => { isFollowingRef.current = isFollowing; }, [isFollowing]);

    const handleFollow = useCallback(async () => {
      const before = isFollowingRef.current;
      await toggleFollow();
      const after = isFollowingRef.current;
      if (before !== after) {
        onFollowPress?.(reel.author.id);
      }
    }, [toggleFollow, onFollowPress, reel.author.id]);

    const handleReaction = useCallback(
      (emoji: string) => {
        onReactionChange?.(reel.id, emoji);
        void triggerHaptic();
      },
      [onReactionChange, reel.id],
    );

    const openReactionPicker = useCallback(() => {
      setShowReactionPicker(true);
    }, []);

    const closeReactionPicker = useCallback(() => {
      setShowReactionPicker(false);
    }, []);

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
      if (error) {
        toast.error('Не удалось удалить');
      } else {
        toast('Рилс удалён');
        // Оповещаем родителя — удаляем из фида
        onDelete?.(reel.id);
      }
    }, [reel.id, onDelete]);

    const handleOpenReport = useCallback(() => {
      setMoreOpen(false);
      setReportOpen(true);
    }, []);

    const handleMusicPress = useCallback(
      (musicTitle: string) => {
        navigate(`/audio/${encodeURIComponent(musicTitle)}`);
      },
      [navigate],
    );

    /** Long press на видео → picker реакций */
    const handlePointerDown = useCallback((e: React.PointerEvent) => {
      if (e.pointerType === 'touch') {
        longPressTimerRef.current = setTimeout(() => {
          openReactionPicker();
        }, 500);
      }
    }, [openReactionPicker]);

    const handlePointerUp = useCallback(() => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }, []);

    // ---------------------------------------------------------------------------
    // Haptic helper
    // ---------------------------------------------------------------------------

    const triggerHaptic = useCallback(async () => {
      try {
        const cap = await import('@capacitor/haptics' as any) as any;
        await cap.Haptics.impact({ style: cap.ImpactStyle.Light });
      } catch {
        // noop on web
      }
    }, []);

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------

    return (
      <div
        ref={containerRef}
        className="relative w-full h-[100dvh] bg-black overflow-hidden snap-start snap-always"
        data-reel-id={reel.id}
        data-reel-active={isActive}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        {/* ---- Видеоплеер ---- */}
        <ReelPlayer
          videoUrl={reel.video_url}
          thumbnailUrl={reel.thumbnail_url}
          isActive={isActive}
          onDoubleTap={handleDoubleTap}
          className="absolute inset-0 w-full h-full"
        />

        {/* ---- Overlay автора и описания ---- */}
        <ReelOverlay
          author={reel.author}
          description={reel.description}
          musicTitle={reel.music_title}
          musicArtist={reel.music_artist}
          hashtags={reel.hashtags}
          isFollowing={isCurrentlyFollowing}
          onAuthorPress={handleAuthorClick}
          onHashtagPress={onHashtagPress}
          onFollowPress={handleFollow}
          onMusicPress={handleMusicPress}
        />

        {/* ---- Sidebar (правая колонка) ---- */}
        {isActive && (
          <ReelSidebar
            reelId={reel.id}
            metrics={reel.metrics}
            isLiked={reel.is_liked}
            isSaved={reel.is_saved}
            isReposted={reel.is_reposted}
            reactionCounts={reactionCounts}
            myReaction={myReaction}
            onLike={handleLike}
            onComment={handleComment}
            onShare={handleShare}
            onSave={handleSave}
            onRepost={handleRepost}
            onMore={handleMore}
            onMuteToggle={toggleMute}
            onReaction={handleReaction}
            isMuted={isMuted}
          />
        )}

        {/* ---- Double-tap сердце ---- */}
        <ReelDoubleTapHeart
          position={heartPosition}
          onAnimationComplete={handleHeartAnimationComplete}
        />

        {/* ---- Picker реакций (long press) ---- */}
        <AnimatePresence>
          {showReactionPicker && reactionCounts.length > 0 && (
            <ReelReactionPicker
              reactionCounts={reactionCounts}
              myReaction={myReaction}
              onReaction={handleReaction}
              position={getPickerPosition()}
            />
          )}
        </AnimatePresence>

        {/* ---- Action sheet (More) ---- */}
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
                <button
                  onClick={handleNotInterested}
                  className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-zinc-800 text-white"
                >
                  <EyeOff size={20} /> Не интересует
                </button>
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-zinc-800 text-white"
                >
                  <Link2 size={20} /> Скопировать ссылку
                </button>
                <button
                  onClick={handleOpenReport}
                  className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-zinc-800 text-red-400"
                >
                  <Flag size={20} /> Пожаловаться
                </button>
                {isOwn && (
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-zinc-800 text-red-500"
                  >
                    <MessageCircle size={20} /> Удалить
                  </button>
                )}
                <button
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-zinc-800 text-zinc-400 mt-2"
                >
                  <Heart size={20} /> Отмена
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