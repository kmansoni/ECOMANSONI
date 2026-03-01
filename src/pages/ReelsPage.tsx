import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  Repeat2,
  Music2,
  Play,
  User,
  Loader2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useReels } from "@/hooks/useReels";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ReelCommentsSheet } from "@/components/reels/ReelCommentsSheet";
import { ReelShareSheet } from "@/components/reels/ReelShareSheet";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { RankingExplanation } from "@/components/reel/RankingExplanation";

const REELS_NAV_COOLDOWN_MS = 350;
const REELS_WHEEL_THRESHOLD_PX = 18;
const REELS_VIDEO_RETRY_LIMIT = 2;
const REELS_VIDEO_RETRY_BASE_DELAY_MS = 1200;

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  }
  return num.toString();
}

function isProbablyVideoUrl(url: string): boolean {
  const lower = (url || "").toLowerCase();

  if (!lower) return false;

  if (lower.startsWith("blob:") || lower.startsWith("data:video/")) {
    return true;
  }
  
  // Covers public storage URLs and direct file URLs.
  if (/\.(mp4|webm|mov|avi|m4v|m3u8)(\?|#|$)/.test(lower)) {
    return true;
  }

  if (lower.includes("content-type=video") || lower.includes("mime=video")) {
    return true;
  }
  
  // Heuristic fallback: some URLs don't contain an extension.
  if (lower.includes("video/")) {
    return true;
  }
  
  // Supabase storage paths
  if (lower.includes("/reels-media/") || lower.includes("/storage/v1/object/public/reels-media/")) {
    return true;
  }
  
  return false;
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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isUserPaused, setIsUserPaused] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [commentsReelId, setCommentsReelId] = useState<string | null>(null);
  const [shareReelId, setShareReelId] = useState<string | null>(null);
  const [failedVideoIds, setFailedVideoIds] = useState<Set<string>>(() => new Set());
  
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const reelElementRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const touchStartY = useRef<number | null>(null);
  const touchStartAt = useRef<number | null>(null);
  const lastNavAt = useRef<number>(0);
  const viewRecordedForReel = useRef<Set<string>>(new Set());
  // Progressive tracking state (per reel, per session)
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
  const videoErrorRetries = useRef<Map<string, number>>(new Map());
  const lastProgressRef = useRef(0);

  const currentReel = reels[currentIndex];
  const overlaysOpen = !!commentsReelId || !!shareReelId;

  const syncPlaybackPolicy = useCallback(
    (nextUserPaused: boolean = isUserPaused) => {
      const isHidden = typeof document !== "undefined" && document.visibilityState !== "visible";
      const shouldPause = overlaysOpen || isHidden || nextUserPaused;
      setIsPlaying(!shouldPause);
    },
    [isUserPaused, overlaysOpen],
  );

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
      setIsUserPaused(false);
      syncPlaybackPolicy(false);
    },
    [reels.length, syncPlaybackPolicy],
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

  // Auto-load next page when approaching the end.
  useEffect(() => {
    if (loading) return;
    if (loadingMore) return;
    if (!hasMore) return;
    if (reels.length === 0) return;

    if (currentIndex >= reels.length - 3) {
      loadMore();
    }
  }, [currentIndex, hasMore, loadMore, loading, loadingMore, reels.length]);

  // IntersectionObserver: viewport tracking (50%+ visibility, 1+ sec)
  useEffect(() => {
    const visibilityTimersMap = visibilityTimers.current;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const reelId = entry.target.getAttribute('data-reel-id');
          const reelIndex = parseInt(entry.target.getAttribute('data-reel-index') || '0', 10);
          const reel = reels[reelIndex];
          if (!reelId || !reel) return;

          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            // Reel is 50%+ visible: start timer for impression (1+ sec)
            if (!visibilityTimers.current.has(reelId)) {
              const timer = setTimeout(() => {
                // After 1 sec visibility: record impression
                if (!impressionRecordedForReel.current.get(reelId)) {
                  impressionRecordedForReel.current.set(reelId, true);
                  recordImpression(reelId, {
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
            // Reel is <50% visible: clear timer
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

    // Observe all reel elements
    reelElementRefs.current.forEach((element) => {
      if (element) observer.observe(element);
    });

    return () => {
      observer.disconnect();
      // Clear all visibility timers
      visibilityTimersMap.forEach((timer) => clearTimeout(timer));
      visibilityTimersMap.clear();
    };
  }, [reels, recordImpression]);

  // Track watch time: start timer when reel becomes active
  useEffect(() => {
    if (!currentReel) return;
    const reelId = currentReel.id;
    const reelDuration = currentReel.duration_seconds ?? 30; // fallback to 30s
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

        // Progressive Disclosure Layer 1: VIEWED (>2 sec)
        if (watchedSeconds >= 2 && !viewedRecordedForReelMap.get(reelId)) {
          viewedRecordedForReelMap.set(reelId, true);
          recordViewed(reelId, watchedSeconds, reelDuration);
        }

        // Progressive Disclosure Layer 2: WATCHED (>50% completion)
        const completionRate = (watchedSeconds / reelDuration) * 100;
        if (completionRate >= 50 && !watchedRecordedForReelMap.get(reelId)) {
          watchedRecordedForReelMap.set(reelId, true);
          recordWatched(reelId, watchedSeconds, reelDuration);
        }

        // Negative Signal: SKIP (<2 sec when switching away)
        if (watchedSeconds < 2 && !viewedRecordedForReelMap.get(reelId)) {
          recordSkip(reelId, watchedSeconds, reelDuration);
        }
      }
      reelWatchStartMsMap.delete(reelId);
    };
  }, [currentReel, recordViewed, recordWatched, recordSkip]);

  // Prefetch next reels for smoother swipe transitions.
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

  useEffect(() => {
    const candidates = [reels[currentIndex + 1], reels[currentIndex + 2]].filter(Boolean);
    candidates.forEach((reel) => {
      if (isProbablyVideoUrl(reel.video_url) && !prefetchedVideoUrls.current.has(reel.video_url)) {
        prefetchedVideoUrls.current.add(reel.video_url);
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.as = "video";
        link.href = reel.video_url;
        document.head.appendChild(link);
      }
      if (reel.thumbnail_url && !prefetchedPosterUrls.current.has(reel.thumbnail_url)) {
        prefetchedPosterUrls.current.add(reel.thumbnail_url);
        const img = new Image();
        img.src = reel.thumbnail_url;
      }
    });
  }, [currentIndex, reels]);

  // Record view on video play (first view) or after 10s of watch time (repeat view)
  const handleVideoPlay = useCallback(
    (reelId: string, authorId: string) => {
      // Do not count self-views
      if (user && authorId === user.id) return;

      const alreadyRecorded = viewRecordedForReel.current.has(reelId);
      if (!alreadyRecorded) {
        // First view: record immediately on play
        viewRecordedForReel.current.add(reelId);
        recordView(reelId);
        return;
      }

      // Repeat view: must have watched ≥10 seconds total
      const totalWatched = reelTotalWatchedMs.current.get(reelId) ?? 0;
      if (totalWatched >= 10_000) {
        // Reset counter and record new view
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
          // If unmuted play fails (browser policy), try muted
          if (!video.muted) {
            video.muted = true;
            setIsMuted(true);
            void video.play().catch((retryErr) => {
              console.error("[Reels] Muted play also failed:", retryErr);
            });
          }
        });
    }
  }, [isMuted]);

  // Handle video play/pause based on current index
  useEffect(() => {
    videoRefs.current.forEach((video, index) => {
      if (index === currentIndex && isPlaying) {
        // Only play if not already playing
        if (video.paused) {
          video.muted = isMuted;
          tryPlayVideo(index);
        } else {
          // Just sync muted state if already playing
          video.muted = isMuted;
        }
      } else {
        // Pause non-current videos
        if (!video.paused) {
          video.pause();
        }
      }
    });
  }, [currentIndex, isMuted, isPlaying, tryPlayVideo]);

  // Pause policy: overlay open/close + app background/foreground.
  useEffect(() => {
    if (overlaysOpen) {
      syncPlaybackPolicy();
      return;
    }
    syncPlaybackPolicy();
  }, [overlaysOpen, syncPlaybackPolicy]);

  useEffect(() => {
    const onVisibilityChange = () => {
      syncPlaybackPolicy();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [syncPlaybackPolicy]);

  // Sync muted state separately (don't retrigger play)
  useEffect(() => {
    const currentVideo = videoRefs.current.get(currentIndex);
    if (currentVideo) {
      currentVideo.muted = isMuted;
    }
  }, [isMuted, currentIndex]);

  // Native scroll handler - detect which reel is visible
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    const scrollTop = container.scrollTop;
    const itemHeight = container.clientHeight;
    const newIndex = Math.round(scrollTop / itemHeight);

    if (newIndex !== currentIndex && newIndex >= 0 && newIndex < reels.length) {
      setCurrentIndex(newIndex);
      setIsUserPaused(false);
      syncPlaybackPolicy(false);
    }
  }, [currentIndex, reels.length, syncPlaybackPolicy]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      // Desktop convenience: wheel/trackpad scrolls one reel at a time.
      // Keep native touch scroll-snap for mobile.
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

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartY.current = e.touches[0].clientY;
    touchStartAt.current = Date.now();
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const startY = touchStartY.current;
      const startAt = touchStartAt.current;
      touchStartY.current = null;
      touchStartAt.current = null;

      if (startY == null || startAt == null) return;
      const endY = e.changedTouches[0]?.clientY;
      if (typeof endY !== "number") return;

      const dy = endY - startY;
      const dt = Date.now() - startAt;

      // Debounce nav: avoid double-trigger on some devices.
      const now = Date.now();
      if (now - lastNavAt.current < REELS_NAV_COOLDOWN_MS) return;

      // Fallback swipe navigation: helpful on devices where nested scroll + snap is flaky.
      // Only trigger on a reasonably fast, deliberate swipe.
      if (dt > 800) {
        return;
      }
      if (Math.abs(dy) < 60) {
        return;
      }

      lastNavAt.current = now;

      if (dy < 0) {
        // swipe up -> next
        navigateRelative(1);
      } else {
        // swipe down -> prev
        navigateRelative(-1);
      }
    },
    [navigateRelative],
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
          // Best-effort: refresh feed so the item disappears sooner.
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
      setIsUserPaused(true);
      syncPlaybackPolicy(true);
      return;
    }

    setIsUserPaused(false);
    syncPlaybackPolicy(false);
  }, [isPlaying, syncPlaybackPolicy]);

  const toggleMute = useCallback(() => {
    setIsMuted(!isMuted);
  }, [isMuted]);

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

  // Double tap to like
  const lastTap = useRef<number>(0);
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  
  const handleDoubleTap = useCallback((reelId: string, isLiked: boolean) => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (!isLiked) {
        handleLike(reelId);
      }
      setShowHeartAnimation(true);
      setTimeout(() => setShowHeartAnimation(false), 1000);
    } else {
      togglePlay();
    }
    lastTap.current = now;
  }, [handleLike, togglePlay]);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-transparent flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white" />
      </div>
    );
  }

  const header = (
    <header className="sticky top-0 z-30 safe-area-top backdrop-blur-xl bg-black/20 border-b border-white/10">
      <div className="h-12 px-3 flex items-center" />
    </header>
  );

  if (reels.length === 0) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-transparent text-white">
        {header}
        <div className="flex flex-col items-center justify-center text-white px-4" style={{ minHeight: "calc(100vh - 4rem - 3rem)" }}>
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
    <div className="h-[calc(100vh-4rem)] bg-transparent">
      {header}
      <div
        ref={containerRef}
        className="h-[calc(100vh-4rem-3rem)] overflow-y-auto overflow-x-hidden scrollbar-hide"
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
          className="relative w-full h-[calc(100vh-4rem-3rem)] flex-shrink-0"
          style={{
            scrollSnapAlign: 'start',
            scrollSnapStop: 'always',
          }}
          onClick={() => handleDoubleTap(reel.id, reel.isLiked || false)}
        >
          {/* Video/Image Background */}
          <div className="absolute inset-0 overflow-hidden" style={{ zIndex: 0 }}>
            {isProbablyVideoUrl(reel.video_url) && !failedVideoIds.has(reel.id) ? (
              <video
                ref={(el) => {
                  if (el) {
                    videoRefs.current.set(index, el);
                    // Playback attributes (some mobile webviews are picky)
                    el.setAttribute('webkit-playsinline', 'true');
                    el.setAttribute('x5-playsinline', 'true');
                  } else {
                    videoRefs.current.delete(index);
                  }
                }}
                src={reel.video_url}
                className="w-full h-full"
                style={{
                  backgroundColor: '#000',
                  objectFit: 'contain',
                  zIndex: 1,
                  display: 'block',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                }}
                loop
                muted={isMuted}
                playsInline
                autoPlay={index === currentIndex && isPlaying}
                preload="auto"
                onError={(e) => {
                  console.error("[Reels] Video ERROR:", reel.id, e);
                  handleVideoError(reel.id, index);
                }}
                onLoadedMetadata={(e) => {
                  const vid = e.currentTarget;
                  console.log("[Reels] ✓ Metadata loaded:", {
                    id: reel.id.slice(0,8),
                    videoSize: `${vid.videoWidth}x${vid.videoHeight}`,
                    displaySize: `${vid.clientWidth}x${vid.clientHeight}`,
                    duration: vid.duration.toFixed(1),
                  });
                  updateCurrentProgress(index, vid);
                }}
                onLoadedData={() => {
                  if (index === currentIndex && isPlaying) tryPlayVideo(index);
                }}
                onPlay={(e) => {
                  const vid = e.currentTarget;
                  console.log("[Reels] ▶ Video PLAY:", {
                    paused: vid.paused,
                    currentTime: vid.currentTime,
                    width: vid.offsetWidth,
                    height: vid.offsetHeight,
                    visible: vid.offsetParent !== null,
                    display: getComputedStyle(vid).display,
                  });
                  handleVideoPlay(reel.id, reel.author_id);
                }}
                onPlaying={() => {
                  // Video is actually playing now
                }}
                onPause={() => {
                  // Video paused
                }}
                onTimeUpdate={(e) => {
                  updateCurrentProgress(index, e.currentTarget);
                }}
              />
            ) : reel.thumbnail_url ? (
              <img
                src={reel.thumbnail_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-black flex items-center justify-center">
                <Play className="w-12 h-12 text-white/60" />
              </div>
            )}

            {/* Play/Pause indicator */}
            {index === currentIndex && !isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-20 h-20 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center animate-scale-in">
                  <Play className="w-10 h-10 text-white fill-white ml-1" />
                </div>
              </div>
            )}
            
            {/* Double tap heart animation */}
            {index === currentIndex && showHeartAnimation && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Heart 
                  className="w-28 h-28 text-white fill-white animate-[heartBurst_1s_ease-out_forwards]" 
                  style={{
                    filter: 'drop-shadow(0 0 20px rgba(255,255,255,0.5))',
                  }}
                />
              </div>
            )}
          </div>

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
          <div className="absolute right-3 bottom-8 flex flex-col items-center gap-4 z-10">
            <button
              className="flex flex-col items-center gap-1"
              onClick={(e) => {
                e.stopPropagation();
                if (!user) {
                  toast.error("Войдите, чтобы создавать Reels");
                  navigate('/auth');
                  return;
                }
                navigate('/create?tab=reels&auto=1');
              }}
              aria-label="Создать Reel"
              title="Создать Reel"
            >
              <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
                <Play className="w-6 h-6 text-white" />
              </div>
              <span className="text-white text-xs font-medium">Создать</span>
            </button>

            {/* Feedback */}
            <button
              className="flex flex-col items-center gap-1"
              onClick={(e) => {
                e.stopPropagation();
                handleFeedback(reel.id, "interested");
              }}
              title="Интересно"
            >
              <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
                <span className="text-white text-lg">👍</span>
              </div>
              <span className="text-white text-xs font-medium">Интересно</span>
            </button>

            <button
              className="flex flex-col items-center gap-1"
              onClick={(e) => {
                e.stopPropagation();
                handleFeedback(reel.id, "not_interested");
              }}
              title="Не интересно"
            >
              <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
                <span className="text-white text-lg">👎</span>
              </div>
              <span className="text-white text-xs font-medium">Не интересно</span>
            </button>

            {/* Like */}
            <button 
              className="flex flex-col items-center gap-1" 
              onClick={(e) => { e.stopPropagation(); handleLike(reel.id); }}
            >
              <div
                className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200",
                  reel.isLiked ? "bg-destructive/20 scale-110" : "bg-white/10 backdrop-blur-sm"
                )}
              >
                <Heart
                  className={cn(
                    "w-7 h-7 transition-all duration-200",
                    reel.isLiked ? "text-destructive fill-destructive scale-110" : "text-white"
                  )}
                />
              </div>
              <span className="text-white text-xs font-medium">
                {reel.likes_count > 0 ? formatNumber(reel.likes_count) : ""}
              </span>
            </button>

            {/* Comments */}
            <button 
              className="flex flex-col items-center gap-1" 
              onClick={(e) => { 
                e.stopPropagation(); 
                setCommentsReelId(reel.id);
              }}
            >
              <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
                <MessageCircle className="w-7 h-7 text-white" />
              </div>
              <span className="text-white text-xs font-medium">
                {reel.comments_count > 0 ? formatNumber(reel.comments_count) : ""}
              </span>
            </button>

            {/* Share */}
            <button 
              className="flex flex-col items-center gap-1" 
              onClick={(e) => { 
                e.stopPropagation(); 
                if (!user) {
                  toast.error("Войдите, чтобы поделиться");
                  navigate("/auth");
                  return;
                }
                setShareReelId(reel.id);
              }}
            >
              <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
                <Send className="w-6 h-6 text-white" />
              </div>
              <span className="text-white text-xs font-medium">Отправить</span>
            </button>

            {/* Repost */}
            <button
              className="flex flex-col items-center gap-1"
              onClick={(e) => {
                e.stopPropagation();
                handleRepost(reel.id);
              }}
            >
              <div
                className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200",
                  reel.isReposted ? "bg-white/20 scale-110" : "bg-white/10 backdrop-blur-sm",
                )}
              >
                <Repeat2
                  className={cn(
                    "w-6 h-6 transition-all duration-200",
                    reel.isReposted ? "text-white scale-110" : "text-white",
                  )}
                />
              </div>
              <span className="text-white text-xs font-medium">
                {(reel.reposts_count || 0) > 0 ? formatNumber(reel.reposts_count || 0) : ""}
              </span>
            </button>

            {/* Save */}
            <button
              className="flex flex-col items-center gap-1"
              onClick={(e) => {
                e.stopPropagation();
                handleSave(reel.id);
              }}
            >
              <div
                className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200",
                  reel.isSaved ? "bg-white/20 scale-110" : "bg-white/10 backdrop-blur-sm",
                )}
              >
                <Bookmark
                  className={cn(
                    "w-6 h-6 transition-all duration-200",
                    reel.isSaved ? "text-white fill-white scale-110" : "text-white",
                  )}
                />
              </div>
              <span className="text-white text-xs font-medium">
                {(reel.saves_count || 0) > 0 ? formatNumber(reel.saves_count || 0) : ""}
              </span>
            </button>

            {/* Author avatar */}
            <button
              className="relative"
              onClick={(e) => {
                e.stopPropagation();
                // Always navigate by author_id (user_id) to ensure correct profile
                if (reel.author_id) {
                  navigate(`/user/${reel.author_id}`);
                }
              }}
            >
              <Avatar className="w-11 h-11 border-2 border-white">
                <AvatarImage src={reel.author?.avatar_url || undefined} />
                <AvatarFallback className="bg-muted">
                  <User className="w-5 h-5" />
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                <span className="text-primary-foreground text-xs font-bold">+</span>
              </div>
            </button>
          </div>

          <div className="absolute left-4 right-20 bottom-4 z-10">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-white font-semibold">
                @{reel.author?.display_name || "user"}
              </span>
              {reel.author?.verified && <VerifiedBadge size="sm" />}
            </div>
            {reel.description && (
              <p className="text-white/90 text-sm line-clamp-2 mb-3">
                {reel.description}
              </p>
            )}
            {reel.music_title && (
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center animate-spin-slow">
                  <Music2 className="w-4 h-4 text-white" />
                </div>
                <span className="text-white/80 text-sm">{reel.music_title}</span>
              </div>
            )}
            <div className="text-white/80">
              <RankingExplanation
                algorithm_version={reel.algorithm_version}
                final_score={reel.final_score}
                ranking_reason={reel.ranking_reason}
                source_pool={reel.source_pool}
                feed_position={reel.feed_position}
              />
            </div>
          </div>
        </div>
      ))}

      {/* Current reel progress */}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 w-[min(360px,calc(100%-2rem))] h-1.5 rounded-full bg-white/30 overflow-hidden z-20">
        <div
          className="h-full bg-white transition-[width] duration-100 linear"
          style={{ width: `${Math.round(currentProgress * 100)}%` }}
        />
      </div>

      </div>

      
      {/* Share Sheet */}
      <ReelShareSheet
        isOpen={!!shareReelId}
        onClose={() => setShareReelId(null)}
        reelId={shareReelId || ""}
      />

      {commentsReelId && (
        <ReelCommentsSheet
          isOpen={!!commentsReelId}
          onClose={() => {
            setCommentsReelId(null);
            refetch();
          }}
          reelId={commentsReelId}
          commentsCount={reels.find(r => r.id === commentsReelId)?.comments_count || 0}
        />
      )}

      {/* Keyframes for heart animation */}
      <style>{`
        @keyframes heartBurst {
          0% {
            transform: scale(0);
            opacity: 1;
          }
          50% {
            transform: scale(1.2);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
