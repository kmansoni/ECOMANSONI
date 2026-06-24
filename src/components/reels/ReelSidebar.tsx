/**
 * @file src/components/reels/ReelSidebar.tsx
 * @description Правый sidebar с действиями — Like, Comment, Share, Save, Repost, Mute.
 * Полная спецификация:
 * - Размер кнопки: 56x56px touch target
 * - Gap между кнопками: 20px
 * - Отступ от правого края: 16px
 * - Отступ от низа: 120px
 * Все кнопки имеют glass surface, ripple эффект, spring-physics анимации и glow при active состоянии.
 */

import React, { memo, useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, MessageCircle, Repeat2, Volume2, VolumeX } from 'lucide-react';
import { formatCount } from '@/lib/reels/format';
import type { ReelMetrics } from '@/types/reels';
import type { ReactionCount } from '@/types/reels/premium';

// ============================================================================
// TYPES
// ============================================================================

interface ReelSidebarProps {
  reelId: string;
  metrics: ReelMetrics;
  isLiked: boolean;
  isSaved: boolean;
  isReposted: boolean;
  reactionCounts: ReactionCount[];
  myReaction: string | null;
  onLike: (reelId: string) => void;
  onLikesOpen?: (reelId: string) => void;
  onComment: () => void;
  onShare: () => void;
  onSave: () => void;
  onRepost: () => void;
  onMore: () => void;
  onMuteToggle: () => void;
  isMuted: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SPRING = { type: 'spring' as const, stiffness: 500, damping: 15 };

// ============================================================================
// HELPERS
// ============================================================================

async function triggerHaptic(): Promise<void> {
  try {
    const cap = await import('@capacitor/haptics' as any) as any;
    await cap.Haptics.impact({ style: cap.ImpactStyle.Light });
  } catch {
    // noop on web
  }
}

// ============================================================================
// LIKE BUTTON
// ============================================================================

interface LikeButtonProps {
  isLiked: boolean;
  emoji: string;
  count: number;
  onClick: (reelId: string) => void;
  reelId: string;
}

const LikeButton = memo<LikeButtonProps>(({ isLiked, emoji, count, onClick, reelId }) => {
  const [particles, setParticles] = useState<{ id: number; angle: number; color: string }[]>([]);
  const [showRing, setShowRing] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const PARTICLE_COLORS = [
    'rgba(255,68,102,0.9)',
    'rgba(255,100,100,0.8)',
    'rgba(255,150,150,0.7)',
    'rgba(255,80,120,0.85)',
    'rgba(255,50,80,0.9)',
    'rgba(255,120,80,0.8)',
  ];

  const handleClick = useCallback(() => {
    void triggerHaptic();
    onClick(reelId);

    if (!isLiked) {
      const newParticles = Array.from({ length: 12 }, (_, i) => ({
        id: Date.now() + i,
        angle: i * 30 + Math.random() * 10 - 5,
        color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
      }));
      setParticles(newParticles);
      setShowRing(true);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setParticles([]), 800);

      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = setTimeout(() => setShowRing(false), 600);
    }
  }, [isLiked, onClick, reelId]);

  return (
    <div className="flex flex-col items-center gap-1">
      <motion.button
        type="button"
        onClick={handleClick}
        whileTap={{ scale: 0.85 }}
        transition={SPRING}
        className="relative flex items-center justify-center w-10 h-10 rounded-2xl backdrop-blur-xl bg-white/[0.06] hover:bg-white/[0.10] transition-all duration-200"
        aria-label={`${emoji}, ${formatCount(count)}`}
        aria-pressed={isLiked}
      >
        {/* Expanding ring on like */}
        <AnimatePresence>
          {showRing && (
            <motion.div
              initial={{ scale: 0.3, opacity: 0.8 }}
              animate={{ scale: 2.5, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="absolute inset-0 rounded-2xl border-2 border-pink-500/60"
            />
          )}
        </AnimatePresence>

        {/* Inner glow */}
        <motion.div
          animate={isLiked ? { scale: [0, 1.2, 1], opacity: [0, 0.4, 0.15] } : { scale: 0, opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="absolute inset-0 rounded-2xl bg-gradient-to-br from-pink-500/40 to-rose-500/30 pointer-events-none"
        />

        <div
          className="absolute inset-0 rounded-3xl pointer-events-none"
          style={{
            background: isLiked
              ? 'radial-gradient(circle at center, rgba(255,68,102,0.4), transparent 70%)'
              : 'linear-gradient(145deg, rgba(255,255,255,0.08), transparent)',
          }}
        />
        <div
          className="absolute inset-x-4 top-0 h-px pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
          }}
        />
        <motion.span
          key={emoji}
          animate={isLiked ? {
            scale: [1, 1.5, 0.8, 1.2, 0.95, 1.05, 1],
            rotate: [0, -20, 20, -15, 15, -10, 10, 0],
          } : {}}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          className="relative z-10 text-[24px] leading-none"
          style={{
            filter: isLiked ? 'drop-shadow(0 0 14px rgba(255,68,102,0.8))' : '',
          }}
        >
          {emoji}
        </motion.span>
        <AnimatePresence>
          {particles.map((p) => (
            <motion.span
              key={p.id}
              initial={{ scale: 0, opacity: 1 }}
              animate={{
                scale: 0,
                opacity: 0,
                x: Math.cos((p.angle * Math.PI) / 180) * 50,
                y: Math.sin((p.angle * Math.PI) / 180) * 50,
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="absolute w-2.5 h-2.5 rounded-full pointer-events-none"
              style={{ background: p.color, boxShadow: `0 0 8px ${p.color}` }}
            />
          ))}
        </AnimatePresence>
      </motion.button>
      <motion.span
        key={count}
        initial={isLiked ? { scale: 1.5, opacity: 0 } : { scale: 1, opacity: 1 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="text-white text-[11px] font-semibold drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
      >
        {formatCount(count)}
      </motion.span>
    </div>
  );
});
LikeButton.displayName = 'LikeButton';

// ============================================================================
// ACTION BUTTON
// ============================================================================

interface ActionButtonProps {
  icon: React.ReactNode;
  count?: number;
  isActive?: boolean;
  activeColor?: 'cyan' | 'amber' | 'none';
  onClick: () => void;
  label: string;
}

const ActionButton = memo<ActionButtonProps>(({
  icon,
  count,
  isActive = false,
  activeColor = 'none',
  onClick,
  label,
}) => {
  const getActiveStyles = () => {
    if (activeColor === 'cyan') {
      return 'bg-gradient-to-br from-cyan-500/25 to-teal-500/20 shadow-[0_8px_32px_-8px_rgba(0,180,216,0.4)]';
    }
    if (activeColor === 'amber') {
      return 'bg-gradient-to-br from-amber-500/25 to-yellow-500/20 shadow-[0_8px_32px_-8px_rgba(255,200,50,0.4)]';
    }
    return 'bg-white/[0.06] hover:bg-white/[0.10]';
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <motion.button
        type="button"
        onClick={() => {
          void triggerHaptic();
          onClick();
        }}
        whileTap={{ scale: 0.88 }}
        transition={SPRING}
        className={`relative flex items-center justify-center w-10 h-10 rounded-2xl backdrop-blur-xl transition-all duration-200 ${getActiveStyles()} shadow-[0_8px_24px_-8px_rgba(0,0,0,0.3)]`}
        aria-label={label}
      >
        <div
          className="absolute inset-0 rounded-3xl pointer-events-none"
          style={{
            background: activeColor !== 'none'
              ? `radial-gradient(circle at center, ${activeColor === 'cyan' ? 'rgba(0,180,216,0.2)' : 'rgba(255,200,50,0.2)'}, transparent 70%)`
              : 'linear-gradient(145deg, rgba(255,255,255,0.08), transparent)',
          }}
        />
        <span className="relative z-10">{icon}</span>
      </motion.button>
      {count !== undefined && (
        <motion.span
          key={count}
          initial={{ scale: 1.2, opacity: 0.7 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-white text-[11px] font-semibold drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
        >
          {formatCount(count)}
        </motion.span>
      )}
    </div>
  );
});
ActionButton.displayName = 'ActionButton';

// ============================================================================
// REPOST BUTTON
// ============================================================================

const RepostButton = memo<{ isReposted: boolean; count: number; onClick: () => void }>(({ isReposted, count, onClick }) => (
  <ActionButton
    icon={
      <motion.div animate={{ rotate: isReposted ? 360 : 0 }} transition={{ duration: 0.4, ease: 'easeInOut' }}>
        <Repeat2
          size={24}
          className={isReposted ? 'text-cyan-400' : 'text-white'}
          style={isReposted ? { filter: 'drop-shadow(0 0 8px rgba(0,180,216,0.6))' } : {}}
        />
      </motion.div>
    }
    count={count}
    isActive={isReposted}
    activeColor={isReposted ? 'cyan' : 'none'}
    onClick={onClick}
    label={`Репост, ${formatCount(count)}`}
  />
));
RepostButton.displayName = 'RepostButton';

// ============================================================================
// MUTE BUTTON
// ============================================================================

const MuteButton = memo<{ isMuted: boolean; onClick: () => void }>(({ isMuted, onClick }) => (
  <ActionButton
    icon={
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={isMuted ? 'muted' : 'unmuted'}
          initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.5, rotate: 90 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {isMuted ? (
            <VolumeX size={22} className="text-white/70" />
          ) : (
            <Volume2 size={22} className="text-white" style={{ filter: 'drop-shadow(0 0 6px rgba(0,180,216,0.4))' }} />
          )}
        </motion.div>
      </AnimatePresence>
    }
    onClick={onClick}
    label={isMuted ? 'Включить звук' : 'Выключить звук'}
  />
));
MuteButton.displayName = 'MuteButton';

// ============================================================================
// MORE BUTTON
// ============================================================================

const MoreButton = memo<{ onClick: () => void }>(({ onClick }) => (
  <ActionButton
    icon={
      <motion.div whileHover={{ rotate: 90 }} transition={{ duration: 0.3 }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white" className="opacity-80">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </motion.div>
    }
    onClick={onClick}
    label="Ещё"
  />
));
MoreButton.displayName = 'MoreButton';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ReelSidebar = memo<ReelSidebarProps>(({
  reelId,
  metrics,
  isLiked,
  isSaved,
  isReposted,
  reactionCounts,
  myReaction,
  onLike,
  onLikesOpen,
  onComment,
  onShare,
  onSave,
  onRepost,
  onMore,
  onMuteToggle,
  isMuted,
}) => {
  const currentEmoji = myReaction ?? '❤️';
  const currentCountEntry = reactionCounts.find((r) => r.emoji === currentEmoji);
  const displayCount = currentCountEntry?.count ?? metrics.likes_count;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
      role="group"
      aria-label="Действия"
      className="absolute right-4 bottom-[120px] flex flex-col items-center gap-4 z-30"
    >
      {/* Like emoji + count as two separate interactive targets */}
      <div className="flex flex-col items-center gap-1">
        <LikeButton isLiked={isLiked} emoji={currentEmoji} count={displayCount} onClick={onLike} reelId={reelId} />
        {onLikesOpen && displayCount > 0 && (
          <motion.button
            type="button"
            whileTap={{ scale: 0.88 }}
            onClick={() => onLikesOpen?.(reelId)}
            className="text-white/70 text-[11px] font-semibold drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] hover:text-white transition-colors"
            aria-label="Посмотреть кто поставил лайк"
          >
            {formatCount(displayCount)}
          </motion.button>
        )}
        {!onLikesOpen && (
          <span className="text-white/70 text-[11px] font-semibold drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
            {formatCount(displayCount)}
          </span>
        )}
      </div>

      <ActionButton
        icon={<MessageCircle size={24} className="text-white" />}
        count={metrics.comments_count}
        onClick={onComment}
        label={`Комментарии, ${formatCount(metrics.comments_count)}`}
      />

      <ActionButton
        icon={
          <motion.div whileTap={{ rotate: 15 }} transition={{ duration: 0.2 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </motion.div>
        }
        count={metrics.shares_count}
        onClick={onShare}
        label={`Поделиться, ${formatCount(metrics.shares_count)}`}
      />

      <ActionButton
        icon={
          <motion.div animate={isSaved ? { scale: [1, 1.15, 0.95, 1.05, 1] } : {}} transition={{ duration: 0.3 }}>
            <Bookmark
              size={24}
              className={isSaved ? 'text-amber-400' : 'text-white'}
              fill={isSaved ? 'currentColor' : 'none'}
              strokeWidth={1.5}
              style={isSaved ? { filter: 'drop-shadow(0 0 8px rgba(255,200,50,0.6))' } : {}}
            />
          </motion.div>
        }
        count={metrics.saves_count}
        isActive={isSaved}
        activeColor="amber"
        onClick={onSave}
        label={`Сохранить, ${formatCount(metrics.saves_count)}`}
      />

      <RepostButton isReposted={isReposted} count={metrics.reposts_count} onClick={onRepost} />

      <MuteButton isMuted={isMuted} onClick={onMuteToggle} />

      <MoreButton onClick={onMore} />
    </motion.div>
  );
});

ReelSidebar.displayName = 'ReelSidebar';

export { ReelSidebar };
export type { ReelSidebarProps };
