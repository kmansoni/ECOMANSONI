import { useState, useEffect, useRef, useCallback, useReducer } from "react";
import { useNavigate } from "react-router-dom";
import {
  Play,
  Loader2,
  Volume2,
  VolumeX,
  EyeOff,
  Flag,
  Bookmark,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useReels } from "@/hooks/useReels";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ReelCommentsSheet } from "@/components/reels/ReelCommentsSheet";
import { ReelShareSheet } from "@/components/reels/ReelShareSheet";
import { RemixReelSheet } from "@/components/reels/RemixReelSheet";
import { ReelInsights } from "@/components/reels/ReelInsights";
import { ReelSidebar } from "@/components/reels/ReelSidebar";
import { ReelOverlay } from "@/components/reels/ReelOverlay";
import { ReelPlayer } from "@/components/reels/ReelPlayer";
import { useReelGestures } from "@/hooks/useReelGestures";
import {
  reduceReels,
  createInitialReelsState,
  type ReelsMachineState,
  type ReelsEvent,
} from "@/features/reels/fsm";

const REELS_NAV_COOLDOWN_MS = 350;
const REELS_WHEEL_THRESHOLD_PX = 18;
const REELS_VIDEO_RETRY_LIMIT = 2;
const REELS_VIDEO_RETRY_BASE_DELAY_MS = 1200;

function isProbablyVideoUrl(url: string): boolean {
  const lower = (url || "").toLowerCase();

  if (!lower) return false;

  if (lower.startsWith("blob:") || lower.startsWith("data:video/")) {
    return true;
  }
  
  if (/\.(mp4|webm|mov|avi|m4v|m3u8)(\?|#|$)/.test(lower)) {
    return true;
  }

  if (lower.includes("content-type=video") || lower.includes("mime=video")) {
    return true;
  }
  
  if (lower.includes("video/")) {
    return true;
  }
  
  if (lower.includes("/reels-media/") || lower.includes("/storage/v1/object/public/reels-media/")) {
    return true;
  }
  
  return false;
}

// Wrapper to adapt FSM reducer for useReducer (which expects (state, action) => state)
function fsmReducer(state: ReelsMachineState, event: ReelsEvent): ReelsMachineState {
  return reduceReels(state, event).state;
}

export function ReelsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    reels,
    loading,
    loadMore,
    hasMore,
    loadingMore,
    toggleLike,
    toggleSave,
    toggleRepost,
    recordView,
    recordImpression,
    recordViewed,
    recordWatched,
    recordSkip,
    setReelFeedback,
    refetch,
  } = useReels();

  // --- FSM state via useReducer ---
  const [fsmState, dispatch] = useReducer(fsmReducer, createInitialReelsState());

  // Derivative values from FSM
  const isPlaying = fsmState.status === "PLAYING";
  const isMuted = fsmState.context.isMuted;

  // TODO: currentIndex could be unified with fsmState.context.activeIndex once
  // reels items are fed into FSM via REELS_FEED_LOADED. For now kept as useState.
  const [currentIndex, setCurrentIndex] = useState(0);

  const [currentProgress, setCurrentProgress] = useState(0);
  const [commentsReelId, setCommentsReelId] = useState<string | null>(null);
  const [shareReelId, setShareReelId] = useState<string | null>(null);
  const [failedVideoIds, setFailedVideoIds] = useState<Set<string>>(() => new Set());
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(() => new Set());
  const [contextMenuReelId, setContextMenuReelId] = useState<string | null>(null);
  const [followedAuthors, setFollowedAuthors] = useState<Set<string>>(() => new Set());
  const [remixReelId, setRemixReelId] = useState<string | null>(null);
  const [showCaptions, setShowCaptions] = useState(false);
  const [insightsReelId, setInsightsReelId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const reelElementRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const lastNavAt = useRef<number>(0);
  const viewRecordedForReel = useRef<Set<string>>(new Set());
  const impressionRecordedForReel = useRef<Map<string, boolean>>(new Map());
  const viewedRecordedForReel = useRef<Map<string, boolean>>(new Map());
  const watchedRecordedForReel = useRef<Map<string, boolean>>(new Map());
  const reelWatchStartMs = useRef<Map<string, number>>(new Map());
  const reelTotalWatchedMs = useRef<Map<string, number>>(new Map());
  const visibilityTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const isScrolling = useRef(false);
  const errorToastShown = useRef<Set<string>>(new Set());
  const prefetchedVideoUrls = useRef<Set<string>>(new Set());
  const prefetchedPosterUrls = useRef<Set<string>>(new Set());
  const lastProgressUpdateRef = useRef<number>(0);
  const videoErrorRetries = useRef<Map<string, number>>(new Map());
  const lastProgressRef = useRef(0);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reelsRef = useRef(reels);
  const recordImpressionRef = useRef(recordImpression);

  const currentReel = reels[currentIndex];

  useEffect(() => { reelsRef.current = reels; }, [reels]);
  useEffect(() => { recordImpressionRef.current = recordImpression; }, [recordImpression]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("followers")
      .select("following_id")
      .eq("follower_id", user.id)
      .then(({ data }) => {
        if (data) setFollowedAuthors(new Set(data.map((f: any) => f.following_id)));
      });
  }, [user]);

  const handleFollow = useCallback(async (authorId: string) => {
    if (!user) { toast.error("Войдите, чтобы подписаться"); navigate("/auth"); return; }
    const isFollowing = followedAuthors.has(authorId);
    if (isFollowing) {
      await supabase.from("followers").delete().eq("follower_id", user.id).eq("following_id", authorId);
      setFollowedAuthors(prev => { const n = new Set(prev); n.delete(authorId); return n; });
    } else {
      await (supabase as any).from("followers").insert({ follower_id: user.id, following_id: authorId });
      setFollowedAuthors(prev => new Set([...prev, authorId]));
    }
  }, [user, followedAuthors, navigate]);

  const updateCurrentProgress = useCallback(
    (index: number, video: HTMLVideoElement) => {
      if (index !== currentIndex) return;
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      const raw = duration > 0 ? video.currentTime / duration : 0;
      const clamped = Math.max(0, Math.min(1, raw));
      if (Math.abs(lastProgressRef.current - clamped) < 0.01) return;
      lastProgressRef.current = clamped;
      setCurrentProgress(clamped);
    },
    [currentIndex],
  );

  const scrollToIndex = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= reels.length) {
        return;
      }
      const el = reelElementRefs.current.get(nextIndex);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (containerRef.current) {
        const itemHeight = containerRef.current.clientHeight;
        containerRef.current.scrollTo({ top: nextIndex * itemHeight, behavior: "smooth" });
      }
      setCurrentIndex(nextIndex);
      // Resume playback after navigation (clears tap-pause)
      dispatch({ t: "PLAYER_PLAY" });
    },
    [reels.length],
  );

  const navigateRelative = useCallback(
    (delta: number) => {
      if (reels.length === 0) return;
      if (commentsReelId || shareReelId) return;
      const nextIndex = currentIndex + delta;
      scrollToIndex(nextIndex);
    },
    [commentsReelId, currentIndex, reels.length, scrollToIndex, shareReelId],
  );

  useEffect(() => {
    if (loading) return;
    if (loadingMore) return;
    if (!hasMore) return;
    if (reels.length === 0) return;

    if (currentIndex >= reels.length - 3) {
      loadMore();
    }
  }, [currentIndex, hasMore, loadMore, loading, loadingMore, reels.length]);

  // Create IntersectionObserver once (stable)
  useEffect(() => {
    const visibilityTimersMap = visibilityTimers.current;
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const reelId = entry.target.getAttribute('data-reel-id');
          const reelIndex = parseInt(entry.target.getAttribute('data-reel-index') || '0', 10);
          const reel = reelsRef.current[reelIndex];
          if (!reelId || !reel) return;

          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            if (!visibilityTimers.current.has(reelId)) {
              const timer = setTimeout(() => {
                if (!impressionRecordedForReel.current.get(reelId)) {
                  impressionRecordedForReel.current.set(reelId, true);
                  recordImpressionRef.current(reelId, {
                    position: reel.feed_position ?? reelIndex,
                    source: 'reels_feed',
                    request_id: reel.request_id,
                    algorithm_version: reel.algorithm_version,
                    score: reel.final_score,
                  });
                }
              }, 1000);
              visibilityTimers.current.set(reelId, timer);
            }
          } else {
            const timer = visibilityTimers.current.get(reelId);
            if (timer) {
              clearTimeout(timer);
              visibilityTimers.current.delete(reelId);
            }
          }
        });
      },
      {
        root: containerRef.current,
        threshold: [0, 0.5, 1.0],
      }
    );

    return () => {
      observerRef.current?.disconnect();
      visibilityTimersMap.forEach((timer) => clearTimeout(timer));
      visibilityTimersMap.clear();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Observe/unobserve elements when reel count changes
  useEffect(() => {
    const observer = observerRef.current;
    if (!observer) return;

    const elements = reelElementRefs.current;
    elements.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => {
      elements.forEach((el) => {
        if (el) observer.unobserve(el);
      });
    };
  }, [reels.length]);

  useEffect(() => {
    if (!currentReel) return;
    const reelId = currentReel.id;
    const reelDuration = currentReel.duration_seconds ?? 30;
    const reelWatchStartMsMap = reelWatchStartMs.current;
    const reelTotalWatchedMsMap = reelTotalWatchedMs.current;
    const viewedRecordedForReelMap = viewedRecordedForReel.current;
    const watchedRecordedForReelMap = watchedRecordedForReel.current;
    reelWatchStartMsMap.set(reelId, Date.now());

    return () => {
      const start = reelWatchStartMsMap.get(reelId);
      if (start) {
        const elapsed = Date.now() - start;
        const prev = reelTotalWatchedMsMap.get(reelId) ?? 0;
        const totalWatched = prev + elapsed;
        reelTotalWatchedMsMap.set(reelId, totalWatched);

        const watchedSeconds = Math.floor(totalWatched / 1000);

        if (watchedSeconds >= 2 && !viewedRecordedForReelMap.get(reelId)) {
          viewedRecordedForReelMap.set(reelId, true);
          recordViewed(reelId, watchedSeconds, reelDuration);
        }

        const completionRate = (watchedSeconds / reelDuration) * 100;
        if (completionRate >= 50 && !watchedRecordedForReelMap.get(reelId)) {
          watchedRecordedForReelMap.set(reelId, true);
          recordWatched(reelId, watchedSeconds, reelDuration);
        }

        if (watchedSeconds < 2 && !viewedRecordedForReelMap.get(reelId)) {
          recordSkip(reelId, watchedSeconds, reelDuration);
        }
      }
      reelWatchStartMsMap.delete(reelId);
    };
  }, [currentReel, recordViewed, recordWatched, recordSkip]);

  useEffect(() => {
    lastProgressRef.current = 0;
    setCurrentProgress(0);
  }, [currentIndex]);

  useEffect(() => {
    videoRefs.current.forEach((_, index) => {
      if (index >= reels.length) {
        videoRefs.current.delete(index);
      }
    });
    reelElementRefs.current.forEach((_, index) => {
      if (index >= reels.length) {
        reelElementRefs.current.delete(index);
      }
    });
  }, [reels.length]);

  // Cleanup prefetch links on unmount
  useEffect(() => {
    return () => {
      document.querySelectorAll('link[data-reel-prefetch="true"]').forEach(el => el.remove());
      if (prefetchedVideoUrls.current) prefetchedVideoUrls.current.clear();
      if (prefetchedPosterUrls.current) prefetchedPosterUrls.current.clear();
    };
  }, []);

  useEffect(() => {
    const candidates = [reels[currentIndex + 1], reels[currentIndex + 2]].filter(Boolean);
    candidates.forEach((reel) => {
      if (isProbablyVideoUrl(reel.video_url) && !prefetchedVideoUrls.current.has(reel.video_url)) {
        prefetchedVideoUrls.current.add(reel.video_url);
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.as = "video";
        link.href = reel.video_url;
        link.dataset.reelPrefetch = "true";
        document.head.appendChild(link);
      }
      if (reel.thumbnail_url && !prefetchedPosterUrls.current.has(reel.thumbnail_url)) {
        prefetchedPosterUrls.current.add(reel.thumbnail_url);
        const img = new Image();
        img.src = reel.thumbnail_url;
      }
    });
  }, [currentIndex, reels]);

  const handleVideoPlay = useCallback(
    (reelId: string, authorId: string) => {
      if (user && authorId === user.id) return;

      const alreadyRecorded = viewRecordedForReel.current.has(reelId);
      if (!alreadyRecorded) {
        viewRecordedForReel.current.add(reelId);
        recordView(reelId);
        return;
      }

      const totalWatched = reelTotalWatchedMs.current.get(reelId) ?? 0;
      if (totalWatched >= 10_000) {
        reelTotalWatchedMs.current.set(reelId, 0);
        recordView(reelId);
      }
    },
    [user, recordView],
  );

  const tryPlayVideo = useCallback((index: number) => {
    const video = videoRefs.current.get(index);
    if (!video) return;
    
    video.muted = isMuted;
    video.playsInline = true;
    
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => undefined)
        .catch((err) => {
          console.warn("[Reels] Play failed:", err.name);
          if (!video.muted) {
            video.muted = true;
            // Force mute in FSM as well
            dispatch({ t: "MUTE_TOGGLE" });
            void video.play().catch((retryErr) => {
              console.error("[Reels] Muted play also failed:", retryErr);
            });
          }
        });
    }
  }, [isMuted]);

  // --- FSM-driven video synchronisation ---
  // This replaces the previous imperative useEffect that called tryPlayVideo directly.
  // The FSM status (PLAYING / PAUSED / BUFFERING) drives actual video element calls.
  useEffect(() => {
    videoRefs.current.forEach((video, index) => {
      if (index === currentIndex && isPlaying) {
        if (video.paused) {
          video.muted = isMuted;
          tryPlayVideo(index);
        } else {
          video.muted = isMuted;
        }
      } else {
        if (!video.paused) {
          video.pause();
        }
      }
    });
  }, [currentIndex, isMuted, isPlaying, tryPlayVideo]);

  // Sync document visibility changes into FSM
  useEffect(() => {
    const onVisibilityChange = () => {
      dispatch({ t: "VISIBILITY_CHANGED", isVisible: document.visibilityState === "visible" });
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  // Sync muted state to current video when it changes
  useEffect(() => {
    const currentVideo = videoRefs.current.get(currentIndex);
    if (currentVideo) {
      currentVideo.muted = isMuted;
    }
  }, [isMuted, currentIndex]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    const scrollTop = container.scrollTop;
    const itemHeight = container.clientHeight;
    const newIndex = Math.round(scrollTop / itemHeight);

    if (newIndex !== currentIndex && newIndex >= 0 && newIndex < reels.length) {
      setCurrentIndex(newIndex);
      // Clear tap-pause on scroll navigation
      dispatch({ t: "PLAYER_PLAY" });
    }
  }, [currentIndex, reels.length]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (commentsReelId || shareReelId) return;
      if (!reels.length) return;

      const dy = e.deltaY;
      if (Math.abs(dy) < REELS_WHEEL_THRESHOLD_PX) return;

      const now = Date.now();
      if (now - lastNavAt.current < REELS_NAV_COOLDOWN_MS) return;
      lastNavAt.current = now;

      e.preventDefault();
      navigateRelative(dy > 0 ? 1 : -1);
    },
    [commentsReelId, navigateRelative, reels.length, shareReelId],
  );

  const handleLike = useCallback((reelId: string) => {
    if (!user) {
      toast.error("Войдите, чтобы поставить лайк");
      navigate("/auth");
      return;
    }
    toggleLike(reelId);
  }, [user, toggleLike, navigate]);

  const handleSave = useCallback((reelId: string) => {
    if (!user) {
      toast.error("Войдите, чтобы сохранить");
      navigate("/auth");
      return;
    }
    toggleSave(reelId);
  }, [user, toggleSave, navigate]);

  const handleRepost = useCallback((reelId: string) => {
    if (!user) {
      toast.error("Войдите, чтобы сделать репост");
      navigate("/auth");
      return;
    }
    toggleRepost(reelId);
  }, [user, toggleRepost, navigate]);

  const handleFeedback = useCallback(
    async (reelId: string, feedback: "interested" | "not_interested") => {
      try {
        await setReelFeedback(reelId, feedback);
        toast.success(feedback === "interested" ? "Учтём ваши интересы" : "Покажем меньше такого");
        if (feedback === "not_interested") {
          refetch();
        }
      } catch {
        toast.error("Не удалось отправить обратную связь");
      }
    },
    [setReelFeedback, refetch],
  );

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      dispatch({ t: "PLAYER_PAUSE", reason: "tap" });
    } else {
      dispatch({ t: "PLAYER_PLAY" });
    }
  }, [isPlaying]);

  const toggleMute = useCallback(() => {
    dispatch({ t: "MUTE_TOGGLE" });
  }, []);

  const handleVideoError = useCallback((reelId: string, index: number) => {
    setFailedVideoIds((prev) => {
      if (prev.has(reelId)) return prev;
      const next = new Set(prev);
      next.add(reelId);
      return next;
    });

    const retries = videoErrorRetries.current.get(reelId) ?? 0;
    if (retries < REELS_VIDEO_RETRY_LIMIT) {
      const nextRetries = retries + 1;
      videoErrorRetries.current.set(reelId, nextRetries);
      const delay = REELS_VIDEO_RETRY_BASE_DELAY_MS * nextRetries;

      setTimeout(() => {
        setFailedVideoIds((prev) => {
          if (!prev.has(reelId)) return prev;
          const next = new Set(prev);
          next.delete(reelId);
          return next;
        });

        const video = videoRefs.current.get(index);
        if (video) {
          video.load();
          if (index === currentIndex && isPlaying) {
            tryPlayVideo(index);
          }
        }
      }, delay);
      return;
    }

    if (!errorToastShown.current.has(reelId)) {
      errorToastShown.current.add(reelId);
      toast.error("Видео недоступно");
    }
  }, [currentIndex, isPlaying, tryPlayVideo]);

  const [showHeartAnimation, setShowHeartAnimation] = useState(false);

  const handleTap = useCallback((reelId: string, isLiked: boolean) => {
    if (tapTimeoutRef.current) {
      clearTimeout(tapTimeoutRef.current);
      tapTimeoutRef.current = null;
      if (!isLiked) handleLike(reelId);
      setShowHeartAnimation(true);
      setTimeout(() => setShowHeartAnimation(false), 1000);
    } else {
      tapTimeoutRef.current = setTimeout(() => {
        tapTimeoutRef.current = null;
      }, 300);
    }
  }, [handleLike]);

  const handleTimeUpdate = useCallback((index: number, videoEl: HTMLVideoElement) => {
    const now = Date.now();
    if (now - lastProgressUpdateRef.current < 250) return; // Throttle: max 4 updates/sec
    lastProgressUpdateRef.current = now;
    updateCurrentProgress(index, videoEl);
  }, [updateCurrentProgress]);

  const handleLongPress = useCallback((reelId: string) => {
    setContextMenuReelId(reelId);
  }, []);

  const {
    handleTouchStart,
    handleTouchEnd,
    handleReelTouchStart,
    handleReelTouchEnd,
    handlePointerDown,
    handlePointerUp,
    clearLongPress,
  } = useReelGestures({
    onSwipeUp: () => navigateRelative(1),
    onSwipeDown: () => navigateRelative(-1),
    onTap: handleTap,
    onLongPress: handleLongPress,
    onSwipeLeft: (authorId) => navigate(`/user/${authorId}`),
    lastNavAt,
  });

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-transparent flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white" />
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div className="min-h-[100dvh] bg-transparent text-white">
        <div className="flex flex-col items-center justify-center text-white px-4 min-h-[100dvh]">
          <Play className="w-16 h-16 mb-4 opacity-40" />
          <h2 className="text-lg font-semibold mb-2">Нет Reels</h2>
          <p className="text-white/60 text-center px-8 mb-6">
            Пока нет видео для просмотра. Будьте первым!
          </p>
          {user ? (
            <>
              <p className="text-white/60 text-center px-8">Откройте центр создания, чтобы добавить Reel</p>
              <button
                type="button"
                className="mt-5 h-11 px-5 rounded-full bg-white text-slate-900 font-semibold"
                onClick={() => navigate('/create?tab=reels&auto=1')}
                aria-label="Создать Reel"
              >
                Создать Reel
              </button>
            </>
          ) : (
            <p className="text-white/60 text-center px-8">Войдите, чтобы создавать Reels</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-transparent">
      <div
        ref={containerRef}
        className="h-[100dvh] overflow-y-auto overflow-x-hidden scrollbar-hide"
        onScroll={handleScroll}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          scrollSnapType: 'y mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollBehavior: 'smooth',
          touchAction: 'pan-y',
        }}
      >
      {reels.map((reel, index) => (
        <div
          key={reel.id}
          ref={(el) => {
            if (el) reelElementRefs.current.set(index, el);
            else reelElementRefs.current.delete(index);
          }}
          data-reel-id={reel.id}
          data-reel-index={index}
          className="relative w-full h-[100dvh] flex-shrink-0"
          style={{
            scrollSnapAlign: 'start',
            scrollSnapStop: 'always',
          }}
          onPointerDown={() => handlePointerDown(reel.id, reel.isLiked || false)}
          onPointerUp={() => handlePointerUp(reel.id, reel.isLiked || false)}
          onPointerLeave={clearLongPress}
          onTouchStart={handleReelTouchStart}
          onTouchEnd={(e) => handleReelTouchEnd(reel.author_id, e)}
        >
          {/* Video/Image Background */}
          <ReelPlayer
            reel={reel}
            index={index}
            currentIndex={currentIndex}
            isMuted={isMuted}
            isPlaying={isPlaying}
            showHeartAnimation={showHeartAnimation}
            failedVideoIds={failedVideoIds}
            onVideoRef={(idx, el) => {
              if (el) {
                videoRefs.current.set(idx, el);
                el.setAttribute('webkit-playsinline', 'true');
                el.setAttribute('x5-playsinline', 'true');
              } else {
                videoRefs.current.delete(idx);
              }
            }}
            onError={() => handleVideoError(reel.id, index)}
            onLoadedMetadata={(e) => updateCurrentProgress(index, e.currentTarget)}
            onLoadedData={() => {
              if (index === currentIndex && isPlaying) tryPlayVideo(index);
            }}
            onPlay={() => handleVideoPlay(reel.id, reel.author_id)}
            onTimeUpdate={(e) => handleTimeUpdate(index, e.currentTarget)}
          />

          {/* Gradient overlays */}
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" style={{ zIndex: 2 }} />
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" style={{ zIndex: 2 }} />

          {/* Sound control button (top left) */}
          {index === currentIndex && isProbablyVideoUrl(reel.video_url) && (
            <button
              className="absolute top-4 left-4 z-20 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center transition-all duration-200 hover:bg-black/60 active:scale-95"
              onClick={(e) => {
                e.stopPropagation();
                toggleMute();
              }}
              aria-label={isMuted ? "Включить звук" : "Выключить звук"}
            >
              {isMuted ? (
                <VolumeX className="w-5 h-5 text-white" />
              ) : (
                <Volume2 className="w-5 h-5 text-white" />
              )}
            </button>
          )}

          {/* Right sidebar actions */}
          <ReelSidebar
            reel={reel}
            onLike={() => handleLike(reel.id)}
            onComment={() => {
              setCommentsReelId(reel.id);
              dispatch({ t: "OPEN_COMMENTS" });
            }}
            onShare={() => {
              if (!user) {
                toast.error("Войдите, чтобы поделиться");
                navigate("/auth");
                return;
              }
              setShareReelId(reel.id);
              dispatch({ t: "SHARE_OPEN" });
            }}
            onSave={() => handleSave(reel.id)}
            onAuthorClick={() => {
              if (reel.author_id) navigate(`/user/${reel.author_id}`);
            }}
          />

          {/* Bottom overlay: author info, description, music */}
          <ReelOverlay
            reel={reel}
            user={user}
            followedAuthors={followedAuthors}
            expandedDescriptions={expandedDescriptions}
            onAuthorClick={() => navigate(`/user/${reel.author_id}`)}
            onFollow={() => handleFollow(reel.author_id)}
            onHashtagClick={(tag) => navigate(`/hashtag/${tag}`)}
            onMusicClick={() => {
              if ((reel as any).audio_id) navigate(`/reels/audio/${(reel as any).audio_id}`);
            }}
            onExpandDescription={() => setExpandedDescriptions(prev => {
              const n = new Set(prev);
              expandedDescriptions.has(reel.id) ? n.delete(reel.id) : n.add(reel.id);
              return n;
            })}
            onContextMenu={() => setContextMenuReelId(reel.id)}
          />

          {/* Context menu overlay */}
          {contextMenuReelId === reel.id && (
            <div
              className="absolute inset-0 z-40 bg-black/50 flex items-end"
              onClick={(e) => { e.stopPropagation(); setContextMenuReelId(null); }}
            >
              <div className="w-full bg-zinc-900 rounded-t-2xl p-4 space-y-1" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl"
                  onClick={() => { setContextMenuReelId(null); handleFeedback(reel.id, "not_interested"); }}
                >
                  <EyeOff className="w-5 h-5" /> Не интересно
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl"
                  onClick={() => { setContextMenuReelId(null); handleSave(reel.id); }}
                >
                  <Bookmark className="w-5 h-5" /> Сохранить
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-white/10 rounded-xl"
                  onClick={() => { setContextMenuReelId(null); toast.info("Жалоба отправлена"); }}
                >
                  <Flag className="w-5 h-5" /> Пожаловаться
                </button>
                <button
                  type="button"
                  className="w-full px-4 py-3 text-white/60 hover:bg-white/10 rounded-xl"
                  onClick={() => setContextMenuReelId(null)}
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      </div>

      {/* Current reel progress — outside scroll container, fixed position */}
      <div
        className="fixed left-1/2 -translate-x-1/2 w-[min(360px,calc(100%-2rem))] h-1.5 rounded-full bg-white/30 overflow-hidden z-20 pointer-events-none"
        style={{ top: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}
      >
        <div
          className="h-full bg-white transition-[width] duration-100 ease-linear"
          style={{ width: `${Math.round(currentProgress * 100)}%` }}
        />
      </div>

      {/* Share Sheet */}
      <ReelShareSheet
        isOpen={!!shareReelId}
        onClose={() => {
          setShareReelId(null);
          dispatch({ t: "SHARE_CLOSE" });
        }}
        reelId={shareReelId || ""}
      />

      {commentsReelId && (
        <ReelCommentsSheet
          isOpen={!!commentsReelId}
          onClose={() => {
            setCommentsReelId(null);
            dispatch({ t: "CLOSE_COMMENTS" });
          }}
          reelId={commentsReelId}
          commentsCount={reels.find(r => r.id === commentsReelId)?.comments_count || 0}
        />
      )}
      {/* Remix Sheet */}
      {remixReelId && (
        <RemixReelSheet
          isOpen={!!remixReelId}
          onClose={() => setRemixReelId(null)}
          originalReelId={remixReelId}
          originalVideoUrl={reels.find((r) => r.id === remixReelId)?.video_url || ""}
          onStartRecording={() => { setRemixReelId(null); toast.info("Открой камеру для записи Remix"); }}
        />
      )}

      {/* Insights */}
      {insightsReelId && (
        <ReelInsights
          reelId={insightsReelId}
          isOpen={!!insightsReelId}
          onClose={() => setInsightsReelId(null)}
        />
      )}
    </div>
  );
}
