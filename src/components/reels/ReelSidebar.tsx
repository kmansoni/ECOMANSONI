/**
 * @file src/components/reels/ReelSidebar.tsx
 * @description Вертикальный ряд кнопок действий справа от видео (Phase 3).
 *
 * Архитектура (docs/reels-module-architecture.md, раздел 5.5):
 * - Абсолютное позиционирование, z-index 20
 * - Framer Motion: spring-анимации при toggle Like/Save, whileTap scale для всех кнопок
 * - Touch targets: минимум 44×44px (padding компенсирует меньший размер иконки)
 * - Haptic feedback через Capacitor Haptics (динамический импорт, fallback: noop)
 * - Все счётчики форматируются через formatCount()
 * - React.memo + useCallback для предотвращения лишних ре-рендеров при 60fps
 */

import React, { memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  Repeat2,
  Volume2,
  VolumeX,
  MoreHorizontal,
} from 'lucide-react';
import { formatCount } from '@/lib/reels/format';
import type { ReelMetrics } from '@/types/reels';

// ---------------------------------------------------------------------------
// Haptic feedback (Capacitor — динамический импорт, web fallback = noop)
// ---------------------------------------------------------------------------

async function triggerHaptic(): Promise<void> {
  try {
    const cap = await import('@capacitor/haptics' as any) as any;
    await cap.Haptics.impact({ style: cap.ImpactStyle.Light });
  } catch {
    // Capacitor недоступен на вебе — молча игнорируем
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReelSidebarProps {
  reelId: string;
  metrics: ReelMetrics;
  isLiked: boolean;
  isSaved: boolean;
  isReposted: boolean;
  authorAvatarUrl: string | null;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onSave: () => void;
  onRepost: () => void;
  onMore: () => void;
  onMuteToggle: () => void;
  isMuted: boolean;
}

// ---------------------------------------------------------------------------
// Spring transition — используется для bounce-анимации toggle-кнопок
// ---------------------------------------------------------------------------

const SPRING_BOUNCE = {
  type: 'spring' as const,
  stiffness: 500,
  damping: 15,
};

// ---------------------------------------------------------------------------
// SidebarButton — переиспользуемый touch-target (44×44 минимум)
// ---------------------------------------------------------------------------

interface SidebarButtonProps {
  onClick: () => void;
  ariaLabel: string;
  ariaPressed?: boolean;
  children: React.ReactNode;
  counter?: string;
}

const SidebarButton = memo<SidebarButtonProps>(
  ({ onClick, ariaLabel, ariaPressed, children, counter }) => (
    <div className="flex flex-col items-center gap-1">
      <motion.button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        {...(ariaPressed !== undefined ? { 'aria-pressed': ariaPressed } : {})}
        /**
         * Touch target ≥ 44×44px:
         * иконка 28px + padding 8px по каждой стороне = 44px
         */
        className="flex items-center justify-center w-11 h-11 rounded-full"
        whileTap={{ scale: 0.85 }}
        transition={SPRING_BOUNCE}
      >
        {children}
      </motion.button>
      {counter !== undefined && (
        <span className="text-white text-[11px] font-medium drop-shadow-md select-none leading-none">
          {counter}
        </span>
      )}
    </div>
  ),
);
SidebarButton.displayName = 'SidebarButton';

// ---------------------------------------------------------------------------
// ReelSidebar
// ---------------------------------------------------------------------------

const ReelSidebar = memo<ReelSidebarProps>(
  ({
    metrics,
    isLiked,
    isSaved,
    isReposted,
    onLike,
    onComment,
    onShare,
    onSave,
    onRepost,
    onMore,
    onMuteToggle,
    isMuted,
  }) => {
    // -------------------------------------------------------------------------
    // Callbacks с haptic feedback
    // -------------------------------------------------------------------------

    const handleLike = useCallback(() => {
      void triggerHaptic();
      onLike();
    }, [onLike]);

    const handleSave = useCallback(() => {
      void triggerHaptic();
      onSave();
    }, [onSave]);

    const handleRepost = useCallback(() => {
      void triggerHaptic();
      onRepost();
    }, [onRepost]);

    const handleComment = useCallback(() => {
      void triggerHaptic();
      onComment();
    }, [onComment]);

    const handleShare = useCallback(() => {
      void triggerHaptic();
      onShare();
    }, [onShare]);

    const handleMuteToggle = useCallback(() => {
      void triggerHaptic();
      onMuteToggle();
    }, [onMuteToggle]);

    const handleMore = useCallback(() => {
      void triggerHaptic();
      onMore();
    }, [onMore]);

    // -------------------------------------------------------------------------
    // Render
    // -------------------------------------------------------------------------

    return (
      <div
        role="group"
        aria-label="Действия"
        className="absolute right-3 bottom-[120px] flex flex-col items-center gap-5 z-20"
      >
        {/* 1. Like ---------------------------------------------------------- */}
        <div className="flex flex-col items-center gap-1">
          <motion.button
            type="button"
            onClick={handleLike}
            aria-label={`Нравится, ${formatCount(metrics.likes_count)}`}
            aria-pressed={isLiked}
            className="flex items-center justify-center w-11 h-11 rounded-full"
            whileTap={{ scale: 0.85 }}
            /**
             * Spring bounce при toggle: animate меняется когда isLiked меняется.
             * Ключ используется чтобы Framer Motion повторно запускал анимацию.
             */
            animate={{ scale: 1 }}
            transition={SPRING_BOUNCE}
          >
            <motion.div
              key={isLiked ? 'liked' : 'unliked'}
              animate={{ scale: [1, 1.3, 1] }}
              transition={SPRING_BOUNCE}
            >
              <Heart
                className={`w-7 h-7 drop-shadow-lg ${
                  isLiked
                    ? 'fill-red-500 text-red-500'
                    : 'fill-transparent text-white'
                }`}
              />
            </motion.div>
          </motion.button>
          <span className="text-white text-[11px] font-medium drop-shadow-md select-none leading-none">
            {formatCount(metrics.likes_count)}
          </span>
        </div>

        {/* 2. Comment ------------------------------------------------------- */}
        <SidebarButton
          onClick={handleComment}
          ariaLabel={`Комментарии, ${formatCount(metrics.comments_count)}`}
          counter={formatCount(metrics.comments_count)}
        >
          <MessageCircle className="w-7 h-7 text-white drop-shadow-lg fill-transparent" />
        </SidebarButton>

        {/* 3. Share --------------------------------------------------------- */}
        <SidebarButton
          onClick={handleShare}
          ariaLabel={`Поделиться, ${formatCount(metrics.shares_count)}`}
          counter={formatCount(metrics.shares_count)}
        >
          <Send className="w-7 h-7 text-white drop-shadow-lg" />
        </SidebarButton>

        {/* 4. Save ---------------------------------------------------------- */}
        <div className="flex flex-col items-center gap-1">
          <motion.button
            type="button"
            onClick={handleSave}
            aria-label={`Сохранить, ${formatCount(metrics.saves_count)}`}
            aria-pressed={isSaved}
            className="flex items-center justify-center w-11 h-11 rounded-full"
            whileTap={{ scale: 0.85 }}
            animate={{ scale: 1 }}
            transition={SPRING_BOUNCE}
          >
            <motion.div
              key={isSaved ? 'saved' : 'unsaved'}
              animate={{ scale: [1, 1.3, 1] }}
              transition={SPRING_BOUNCE}
            >
              <Bookmark
                className={`w-7 h-7 drop-shadow-lg ${
                  isSaved ? 'fill-white text-white' : 'fill-transparent text-white'
                }`}
              />
            </motion.div>
          </motion.button>
          <span className="text-white text-[11px] font-medium drop-shadow-md select-none leading-none">
            {formatCount(metrics.saves_count)}
          </span>
        </div>

        {/* 5. Repost -------------------------------------------------------- */}
        <SidebarButton
          onClick={handleRepost}
          ariaLabel={`Репост, ${formatCount(metrics.reposts_count)}`}
          ariaPressed={isReposted}
          counter={formatCount(metrics.reposts_count)}
        >
          <Repeat2
            className={`w-7 h-7 drop-shadow-lg ${
              isReposted ? 'text-green-400' : 'text-white'
            }`}
          />
        </SidebarButton>

        {/* 6. Mute/Unmute --------------------------------------------------- */}
        <SidebarButton
          onClick={handleMuteToggle}
          ariaLabel={isMuted ? 'Включить звук' : 'Выключить звук'}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={isMuted ? 'muted' : 'unmuted'}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.15 }}
            >
              {isMuted ? (
                <VolumeX className="w-5 h-5 text-white drop-shadow-lg" />
              ) : (
                <Volume2 className="w-5 h-5 text-white drop-shadow-lg" />
              )}
            </motion.div>
          </AnimatePresence>
        </SidebarButton>

        {/* 7. More ---------------------------------------------------------- */}
        <SidebarButton
          onClick={handleMore}
          ariaLabel="Ещё"
        >
          <MoreHorizontal className="w-7 h-7 text-white drop-shadow-lg" />
        </SidebarButton>
      </div>
    );
  },
);

ReelSidebar.displayName = 'ReelSidebar';

export { ReelSidebar };
