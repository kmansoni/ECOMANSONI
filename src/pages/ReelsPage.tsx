/**
 * @file src/pages/ReelsPage.tsx
 * @description Полноценный Premium Reels фид с Stories Bar, реакциями,
 * liquid-glass дизайном и всеми фичами на уровне Instagram/Telegram Premium.
 *
 * Архитектурные решения:
 * - Liquid-glass UI: glassCard, aurora orbs, glow effects
 * - IntersectionObserver O(1) памяти
 * - Виртуализация: рендерим только currentIndex ± 1
 * - scroll-snap-type: y mandatory → залипание на каждом Reel
 * - 100dvh для iOS Safari
 * - Pull-to-refresh с glass-индикатором
 * - Stories bar вверху фида
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useReelsContext } from '@/contexts/ReelsContext';
import { useReels, type Reel } from '@/hooks/useReels';
import { useReactions } from '@/hooks/useReactions';
import { ReelItem } from '@/components/reels/ReelItem';
import { ReelCommentsSheet } from '@/components/reels/ReelCommentsSheet';
import { ReelShareSheet } from '@/components/reels/ReelShareSheet';
import { ReelTabs } from '@/components/reels/ReelTabs';
import { AuroraOrbs } from '@/components/ui/glass/AuroraOrbs';
import type { ReelFeedItem, ReelAuthor, ReelMetrics } from '@/types/reels';
import type { ReelFeedItemV3 } from '@/types/reels/premium';
import { logger } from '@/lib/logger';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Heart, HeartOff } from 'lucide-react';

// ---------------------------------------------------------------------------
// Reels feed mode
// ---------------------------------------------------------------------------

type ReelsFeedMode = 'for_you' | 'following';

const REELS_MODE_KEY = 'reels_feed_mode';

function getReelsModeKey(accountId: string | null | undefined): string {
  return accountId ? `${REELS_MODE_KEY}:${accountId}` : REELS_MODE_KEY;
}

function readReelsMode(accountId?: string | null): ReelsFeedMode {
  try {
    const scoped = localStorage.getItem(getReelsModeKey(accountId));
    const v = scoped ?? localStorage.getItem(REELS_MODE_KEY);
    if (v === 'for_you' || v === 'following') return v;
  } catch (error) {
    logger.warn('[ReelsPage] Failed to read feed mode from storage', { accountId, error });
  }
  return 'for_you';
}

function writeReelsMode(mode: ReelsFeedMode, accountId?: string | null): void {
  try {
    localStorage.setItem(getReelsModeKey(accountId), mode);
  } catch (error) {
    logger.warn('[ReelsPage] Failed to persist feed mode to storage', { mode, accountId, error });
  }
}

// ---------------------------------------------------------------------------
// Константы
// ---------------------------------------------------------------------------

const IO_THRESHOLD = 0.5;
const PREFETCH_AHEAD = 2;

// ---------------------------------------------------------------------------
// Маппинг Reel → ReelFeedItem
// ---------------------------------------------------------------------------

function mapToFeedItem(reel: Reel, index: number): ReelFeedItem {
  const author: ReelAuthor = {
    id: reel.author_id,
    username: reel.author?.username ?? String(reel.author_id || '').slice(0, 8),
    display_name: reel.author?.display_name ?? String(reel.author_id || '').slice(0, 8),
    avatar_url: reel.author?.avatar_url ?? null,
    is_verified: reel.author?.verified ?? false,
    is_following: false,
  };

  const metrics: ReelMetrics = {
    likes_count: Math.max(0, reel.likes_count ?? 0),
    comments_count: Math.max(0, reel.comments_count ?? 0),
    shares_count: Math.max(0, reel.shares_count ?? 0),
    saves_count: Math.max(0, reel.saves_count ?? 0),
    views_count: Math.max(0, reel.views_count ?? 0),
    reposts_count: Math.max(0, reel.reposts_count ?? 0),
  };

  const v3 = reel as ReelFeedItemV3;

  return {
    id: reel.id,
    video_url: reel.video_url,
    thumbnail_url: reel.thumbnail_url ?? null,
    description: reel.description ?? null,
    music_title: reel.music_title ?? null,
    music_artist: v3.music_artist ?? null,
    music_id: v3.music_id ?? undefined,
    duration_seconds: reel.duration_seconds ?? 0,
    author,
    metrics,
    hashtags: [],
    created_at: reel.created_at,
    is_liked: reel.isLiked ?? false,
    is_saved: reel.isSaved ?? false,
    is_reposted: reel.isReposted ?? false,
    feed_position: reel.feed_position ?? index,
    recommendation_reason: reel.ranking_reason,
    final_score: reel.final_score,
    reactions: v3.reactions,
  };
}

// ---------------------------------------------------------------------------
// Aurora Orbs Component
// ---------------------------------------------------------------------------

const ReelsAuroraBackground = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    {/* Aurora orbs */}
    <AuroraOrbs
      variant="reels"
      intensity="subtle"
      className="opacity-40"
    />

    {/* Radial gradient overlay */}
    <div
      className="absolute inset-0"
      style={{
        background: 'radial-gradient(ellipse 80% 60% at 50% 0%, transparent 0%, rgba(0,0,0,0.7) 100%)',
      }}
    />

    {/* Vignette effect */}
    <div
      className="absolute inset-0"
      style={{
        background: 'radial-gradient(ellipse 100% 100% at 50% 50%, transparent 50%, rgba(0,0,0,0.5) 100%)',
      }}
    />
  </div>
);

// ---------------------------------------------------------------------------
// Skeleton / Error / Empty screens
// ---------------------------------------------------------------------------

function ReelsSkeletonScreen(): JSX.Element {
  return (
    <div
      className="fixed inset-0 md:absolute md:inset-0 z-50 bg-[#050508] flex flex-col items-center justify-center"
      aria-label="Загрузка Reels"
    >
      <ReelsAuroraBackground />

      {/* Skeleton shimmer */}
      <div className="absolute inset-0 flex flex-col">
        {/* Header skeleton */}
        <div className="h-16 glass-shimmer" />

        {/* Content skeleton */}
        <div className="flex-1 flex items-end pb-24 px-4">
          <div className="space-y-3 w-full max-w-[280px]">
            <div className="h-4 w-3/4 glass-shimmer rounded-lg" />
            <div className="h-3 w-1/2 glass-shimmer rounded-lg" />
            <div className="h-3 w-2/3 glass-shimmer rounded-lg" />
          </div>
        </div>
      </div>

      {/* Loading spinner */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        className="relative z-10 w-12 h-12"
      >
        <div className="absolute inset-0 rounded-full border-2 border-white/20" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400" />
        <div className="absolute inset-2 rounded-full border-2 border-transparent border-r-teal-400/50" />
      </motion.div>
    </div>
  );
}

interface ErrorScreenProps {
  onRetry: () => void;
}

function ReelsErrorScreen({ onRetry }: ErrorScreenProps): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 md:absolute md:inset-0 z-50 bg-[#050508] flex flex-col items-center justify-center gap-6 px-6"
    >
      <ReelsAuroraBackground />

      {/* Glass card error */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative z-10 p-8 rounded-[1.5rem] sm:rounded-[2rem] backdrop-blur-2xl border border-white/15 bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]"
      >
        {/* Glow */}
        <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-red-500/10 via-transparent to-transparent blur-xl opacity-60" />

        {/* Icon */}
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[linear-gradient(145deg,rgba(239,68,68,0.2),rgba(239,68,68,0.05))] border border-red-500/30 flex items-center justify-center"
        >
          <HeartOff size={32} className="text-red-400" />
        </motion.div>

        <p className="text-white text-lg font-semibold text-center mb-2">
          Не удалось загрузить Reels
        </p>
        <p className="text-white/50 text-sm text-center mb-6 max-w-[260px]">
          Проверьте подключение к интернету и попробуйте снова
        </p>

        <motion.button
          onClick={onRetry}
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.02 }}
          className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-semibold shadow-[0_8px_24px_-8px_rgba(0,180,216,0.5)] active:scale-95"
        >
          Повторить
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

function ReelsEmptyScreen(): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 md:absolute md:inset-0 z-50 bg-[#050508] flex flex-col items-center justify-center gap-4 px-8"
    >
      <ReelsAuroraBackground />

      {/* Glass card */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="relative z-10 p-8 rounded-[1.5rem] sm:rounded-[2rem] backdrop-blur-2xl border border-white/15 bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] text-center max-w-[300px]"
      >
        {/* Glow */}
        <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-cyan-500/10 via-transparent to-transparent blur-xl opacity-60" />

        {/* Icon */}
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-[linear-gradient(145deg,rgba(0,180,216,0.15),rgba(0,200,150,0.08))] border border-cyan-500/20 flex items-center justify-center"
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-cyan-400">
            <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </motion.div>

        <p className="text-white text-xl font-semibold mb-2">
          Нет Reels для показа
        </p>
        <p className="text-white/50 text-sm mb-6">
          Подпишитесь на авторов или загляните позже
        </p>

        {/* Decorative dots */}
        <div className="flex justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
              className="w-2 h-2 rounded-full bg-cyan-400/60"
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Pull-to-refresh
// ---------------------------------------------------------------------------

let pullToRefreshStyleAdded = false;
function ensurePullToRefreshStyle() {
  if (pullToRefreshStyleAdded) return;
  if (typeof document === 'undefined') return;

  const style = document.createElement('style');
  style.textContent = `
    /* Glass shimmer animation */
    @keyframes glass-shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    .glass-shimmer {
      background: linear-gradient(
        90deg,
        rgba(255,255,255,0.03) 0%,
        rgba(255,255,255,0.08) 50%,
        rgba(255,255,255,0.03) 100%
      );
      background-size: 200% 100%;
      animation: glass-shimmer 1.5s ease-in-out infinite;
    }

    /* Pull-to-refresh indicator */
    .ptr-indicator {
      position: absolute;
      top: -48px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 8px;
      color: rgba(255,255,255,0.4);
      font-size: 13px;
      transition: all 0.3s ease;
    }
    .ptr-indicator.ready {
      color: rgba(255,255,255,0.8);
    }
    .ptr-indicator.refreshing {
      color: white;
    }

    /* Glow pulse */
    @keyframes glow-pulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }
    .animate-glow-pulse {
      animation: glow-pulse 2s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);
  pullToRefreshStyleAdded = true;
}

// ---------------------------------------------------------------------------
// ReelsPage
// ---------------------------------------------------------------------------

export default function ReelsPage(): JSX.Element {
  const { setIsReelsPage } = useReelsContext();
  const navigate = useNavigate();

  // Feed mode state
  const [feedMode, setFeedModeState] = useState<ReelsFeedMode>('for_you');

  useEffect(() => {
    setFeedModeState(readReelsMode(null));
  }, []);

  const setFeedMode = useCallback((mode: ReelsFeedMode) => {
    setFeedModeState(mode);
    writeReelsMode(mode, null);
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  // Feed mode → useReels mode
  const reelsFeedMode = feedMode === 'following' ? 'friends' : 'reels';

  // Core reels data
  const {
    reels: rawReels,
    loading,
    loadingMore,
    hasMore,
    error: reelsError,
    loadMore,
    toggleLike,
    toggleSave,
    toggleRepost,
    recordImpression,
    recordView,
    refetch,
  } = useReels(reelsFeedMode);

  // Reactions hook
  const {
    fetchReactions,
    toggleReaction,
    getMyReactions,
    getReactionCounts,
  } = useReactions();

  // Load reactions when feed items change
  useEffect(() => {
    if (rawReels.length > 0) {
      const ids = rawReels.map((r: Reel) => r.id);
      void fetchReactions(ids);
    }
  }, [rawReels, fetchReactions]);

  // Loading/error state
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    if (!loading) {
      setHasLoadedOnce(true);
    }
  }, [loading]);

  const showErrorScreen = !loading && !!reelsError && rawReels.length === 0;

  const handleRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  // Map to feed items
  const feedItems: ReelFeedItem[] = useMemo(
    () => rawReels.map((r: Reel, i: number) => mapToFeedItem(r, i)),
    [rawReels],
  );

  // ---------------------------------------------------------------------------
  // Current index via IntersectionObserver
  // ---------------------------------------------------------------------------

  const [currentIndex, setCurrentIndex] = useState(0);
  const [commentsReelId, setCommentsReelId] = useState<string | null>(null);
  const [shareReelId, setShareReelId] = useState<string | null>(null);
  const itemRefs = useRef<Map<number, Element>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevIndexRef = useRef<number>(-1);

  useEffect(() => {
    setIsReelsPage(true);
    ensurePullToRefreshStyle();
    return () => {
      setIsReelsPage(false);
    };
  }, [setIsReelsPage]);

  // Create IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        let maxRatio = 0;
        let maxIndex = -1;

        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            const idxAttr = (entry.target as HTMLElement).dataset.reelIndex;
            if (idxAttr !== undefined) {
              maxIndex = parseInt(idxAttr, 10);
            }
          }
        }

        if (maxIndex >= 0) {
          setCurrentIndex((prev) => {
            if (prev === maxIndex) return prev;
            return maxIndex;
          });
        }
      },
      {
        root: scrollContainerRef.current,
        threshold: IO_THRESHOLD,
      },
    );

    observerRef.current = observer;
    itemRefs.current.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, []);

  const registerRef = useCallback((index: number, el: Element | null) => {
    const observer = observerRef.current;
    if (el) {
      itemRefs.current.set(index, el);
      if (observer) observer.observe(el);
    } else {
      const prev = itemRefs.current.get(index);
      if (prev && observer) observer.unobserve(prev);
      itemRefs.current.delete(index);
    }
  }, []);

  // Record impression on index change
  useEffect(() => {
    if (!feedItems[currentIndex]) return;
    if (prevIndexRef.current === currentIndex) return;
    prevIndexRef.current = currentIndex;

    const reel = feedItems[currentIndex];
    void recordImpression(reel.id);
    void recordView(reel.id);
  }, [currentIndex, feedItems, recordImpression, recordView]);

  // Infinite scroll
  useEffect(() => {
    if (!hasMore) return;
    if (loadingMore) return;
    if (feedItems.length === 0) return;

    const distanceToEnd = feedItems.length - 1 - currentIndex;
    if (distanceToEnd <= PREFETCH_AHEAD) {
      loadMore();
    }
  }, [currentIndex, feedItems.length, hasMore, loadingMore, loadMore]);

  // ---------------------------------------------------------------------------
  // Pull-to-refresh support
  // ---------------------------------------------------------------------------

  const [pullProgress, setPullProgress] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullStartY = useRef<number | null>(null);
  const pullCurrentY = useRef<number | null>(null);

  const handlePullStart = useCallback((clientY: number) => {
    if (scrollContainerRef.current && scrollContainerRef.current.scrollTop <= 0) {
      pullStartY.current = clientY;
      pullCurrentY.current = clientY;
    }
  }, []);

  const handlePullMove = useCallback((clientY: number) => {
    if (pullStartY.current === null || isRefreshing) return;
    pullCurrentY.current = clientY;
    const diff = clientY - pullStartY.current;
    const progress = Math.min(Math.max(diff / 120, 0), 1.5);
    setPullProgress(progress);
  }, [isRefreshing]);

  const handlePullEnd = useCallback(async () => {
    if (pullStartY.current === null || isRefreshing) {
      pullStartY.current = null;
      pullCurrentY.current = null;
      setPullProgress(0);
      return;
    }

    const diff = (pullCurrentY.current ?? 0) - (pullStartY.current ?? 0);

    if (diff > 80) {
      setIsRefreshing(true);
      setPullProgress(1);

      try {
        await refetch();
        toast('Обновлено');
      } catch (err) {
        logger.warn('[ReelsPage] Pull-to-refresh failed', { error: err });
        toast.error('Не удалось обновить');
      } finally {
        setIsRefreshing(false);
        setPullProgress(0);
        pullStartY.current = null;
        pullCurrentY.current = null;
      }
    } else {
      setPullProgress(0);
      pullStartY.current = null;
      pullCurrentY.current = null;
    }
  }, [isRefreshing, refetch]);

  // Bind pull-to-refresh to scroll container touch events
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        handlePullStart(e.touches[0].clientY);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && pullStartY.current !== null) {
        handlePullMove(e.touches[0].clientY);
        if (pullProgress > 0) {
          e.preventDefault();
        }
      }
    };
    const onTouchEnd = () => {
      handlePullEnd();
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
    };
  }, [handlePullStart, handlePullMove, handlePullEnd]);

  // ---------------------------------------------------------------------------
  // Callbacks
  // ---------------------------------------------------------------------------

  const handleLike = useCallback(
    (reelId: string) => void toggleLike(reelId),
    [toggleLike],
  );

  const handleSave = useCallback(
    (reelId: string) => void toggleSave(reelId),
    [toggleSave],
  );

  const handleRepost = useCallback(
    (reelId: string) => void toggleRepost(reelId),
    [toggleRepost],
  );

  const handleShare = useCallback((reelId: string) => {
    setShareReelId(reelId);
  }, []);

  const handleShareClose = useCallback(() => {
    setShareReelId(null);
  }, []);

  const handleComment = useCallback((reelId: string) => {
    setCommentsReelId(reelId);
  }, []);

  const handleCommentsClose = useCallback(() => {
    setCommentsReelId(null);
  }, []);

  const handleAuthorPress = useCallback(
    (authorId: string) => navigate(`/user/${encodeURIComponent(authorId)}`),
    [navigate],
  );

  const handleHashtagPress = useCallback(
    (hashtag: string) => navigate(`/hashtag/${hashtag}`),
    [navigate],
  );

  const handleReaction = useCallback(
    (reelId: string, emoji: string) => {
      void toggleReaction(reelId, emoji);
    },
    [toggleReaction],
  );

  // ---------------------------------------------------------------------------
  // Virtualization
  // ---------------------------------------------------------------------------

  const shouldRender = useCallback(
    (index: number) => Math.abs(index - currentIndex) <= 1,
    [currentIndex],
  );

  // Track viewed indices
  const [viewedIndices, setViewedIndices] = useState<Set<number>>(new Set());

  useEffect(() => {
    setViewedIndices((prev) => {
      const next = new Set(prev);
      next.add(currentIndex);
      return next;
    });
  }, [currentIndex]);

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------

  if (loading && !hasLoadedOnce) {
    return <ReelsSkeletonScreen />;
  }

  if (showErrorScreen) {
    return <ReelsErrorScreen onRetry={handleRetry} />;
  }

  if (!loading && hasLoadedOnce && feedItems.length === 0) {
    return <ReelsEmptyScreen />;
  }

  // Pull-to-refresh indicator position
  const pullTranslateY = pullProgress * -80;

  return (
    <div
      className="fixed inset-0 md:absolute md:inset-0 bg-[#050508] overflow-hidden z-50"
      aria-label="Reels"
    >
      {/* Aurora Background */}
      <ReelsAuroraBackground />

      {/* Pull-to-refresh indicator */}
      <AnimatePresence>
        {pullProgress > 0 && (
          <motion.div
            className="absolute top-0 left-1/2 z-50 flex items-center gap-2"
            style={{
              transform: `translate(-50%, ${pullTranslateY}px)`,
              opacity: Math.min(pullProgress, 1),
            }}
            aria-hidden="true"
          >
            {/* Glass spinner */}
            <motion.div
              animate={{ rotate: isRefreshing ? 360 : 0 }}
              transition={{ duration: 1, repeat: isRefreshing ? Infinity : 0, ease: 'linear' }}
              className="w-8 h-8 rounded-full border-2 border-white/20 border-t-cyan-400/80"
            />
            <span className="text-white/60 text-xs font-medium backdrop-blur-sm px-2 py-1 rounded-full bg-white/5 border border-white/10">
              {isRefreshing ? 'Обновление...' : pullProgress > 1 ? 'Отпустите' : 'Потяните вниз'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Glass header with tabs */}
      <div className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-4 pt-2">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full backdrop-blur-xl bg-white/[0.06] flex items-center justify-center active:scale-90 transition-transform"
          aria-label="Назад"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div
          className="w-[200px] rounded-full backdrop-blur-xl"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          <ReelTabs
            activeTab={feedMode}
            onChange={setFeedMode}
          />
        </div>

        <div className="w-9" />
      </div>

      {/* Scroll container */}
      <div
        ref={scrollContainerRef}
        className="h-[100dvh] w-full overflow-y-scroll snap-y snap-mandatory overscroll-contain [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
        style={{ willChange: 'scroll-position' }}
      >
        {feedItems.map((reel, index) => {
          const isActive = index === currentIndex;

          if (!shouldRender(index)) {
            return (
              <div
                key={reel.id}
                ref={(el) => registerRef(index, el)}
                data-reel-index={index}
                className="h-[100dvh] w-full bg-[#050508] snap-start snap-always flex-shrink-0"
                aria-hidden="true"
              />
            );
          }

          const reelsReactions = getReactionCounts(reel.id);
          const myReaction = getMyReactions(reel.id);

          return (
            <div
              key={reel.id}
              ref={(el) => registerRef(index, el)}
              data-reel-index={index}
              className="h-[100dvh] w-full flex-shrink-0 snap-start snap-always"
            >
              <ReelItem
                reel={reel}
                isActive={isActive}
                onLike={handleLike}
                onSave={handleSave}
                onRepost={handleRepost}
                onShare={handleShare}
                onComment={handleComment}
                onAuthorPress={handleAuthorPress}
                onHashtagPress={handleHashtagPress}
                onFollowPress={() => {}}
                reactionCounts={reelsReactions}
                myReaction={myReaction}
                onReactionChange={handleReaction}
              />
            </div>
          );
        })}

        {/* Loading more indicator */}
        {loadingMore && (
          <div
            className="h-20 w-full flex items-center justify-center"
            aria-label="Загрузка следующей страницы"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-8 h-8 rounded-full border-2 border-white/10 border-t-cyan-400/60"
            />
          </div>
        )}

        {/* End of feed marker */}
        {!hasMore && feedItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="h-24 w-full flex flex-col items-center justify-center gap-3"
          >
            {/* Glass card */}
            <div className="px-6 py-4 rounded-2xl backdrop-blur-xl border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))]">
              <div className="flex items-center gap-3">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500/20 to-teal-500/20 border border-cyan-500/30 flex items-center justify-center"
                >
                  <Heart size={14} className="text-cyan-400" />
                </motion.div>
                <span className="text-white/40 text-sm font-medium">Конец ленты</span>
              </div>
            </div>

            {/* Decorative glow */}
            <div className="absolute w-32 h-32 rounded-full bg-gradient-to-br from-cyan-500/10 to-teal-500/10 blur-3xl" />
          </motion.div>
        )}
      </div>

      {/* Comments sheet */}
      {commentsReelId !== null && (
        <ReelCommentsSheet
          reelId={commentsReelId}
          isOpen={true}
          onClose={handleCommentsClose}
          commentsCount={
            feedItems.find((r) => r.id === commentsReelId)?.metrics.comments_count ?? 0
          }
        />
      )}

      {/* Share sheet */}
      {shareReelId !== null && (
        <ReelShareSheet
          reelId={shareReelId}
          isOpen
          onClose={handleShareClose}
          metrics={feedItems.find((r) => r.id === shareReelId)?.metrics ?? {
            likes_count: 0,
            comments_count: 0,
            shares_count: 0,
            saves_count: 0,
            reposts_count: 0,
            views_count: 0,
          }}
          onShare={() => {}}
        />
      )}
    </div>
  );
}
