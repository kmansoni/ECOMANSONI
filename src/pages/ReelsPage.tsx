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
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useReels } from "@/hooks/useReels";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ReelCommentsSheet } from "@/components/reels/ReelCommentsSheet";
import { ReelShareSheet } from "@/components/reels/ReelShareSheet";
import { VerifiedBadge } from "@/components/ui/verified-badge";

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
  // Covers public storage URLs and direct file URLs.
  if (/\.(mp4|webm|mov|avi|m4v)(\?|#|$)/.test(lower)) return true;
  // Heuristic fallback: some URLs don't contain an extension.
  if (lower.includes("video/")) return true;
  return false;
}

export function ReelsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    reels,
    loading,
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
  const [commentsReelId, setCommentsReelId] = useState<string | null>(null);
  const [shareReelId, setShareReelId] = useState<string | null>(null);
  const [failedVideoIds, setFailedVideoIds] = useState<Set<string>>(() => new Set());
  
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const reelElementRefs = useRef<Map<number, HTMLDivElement>>(new Map());
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

  const currentReel = reels[currentIndex];

  // IntersectionObserver: viewport tracking (50%+ visibility, 1+ sec)
  useEffect(() => {
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
      visibilityTimers.current.forEach((timer) => clearTimeout(timer));
      visibilityTimers.current.clear();
    };
  }, [reels, recordImpression]);

  // Track watch time: start timer when reel becomes active
  useEffect(() => {
    if (!currentReel) return;
    const reelId = currentReel.id;
    const reelDuration = currentReel.duration_seconds ?? 30; // fallback to 30s
    reelWatchStartMs.current.set(reelId, Date.now());

    return () => {
      const start = reelWatchStartMs.current.get(reelId);
      if (start) {
        const elapsed = Date.now() - start;
        const prev = reelTotalWatchedMs.current.get(reelId) ?? 0;
        const totalWatched = prev + elapsed;
        reelTotalWatchedMs.current.set(reelId, totalWatched);

        const watchedSeconds = Math.floor(totalWatched / 1000);

        // Progressive Disclosure Layer 1: VIEWED (>2 sec)
        if (watchedSeconds >= 2 && !viewedRecordedForReel.current.get(reelId)) {
          viewedRecordedForReel.current.set(reelId, true);
          recordViewed(reelId);
        }

        // Progressive Disclosure Layer 2: WATCHED (>50% completion)
        const completionRate = (watchedSeconds / reelDuration) * 100;
        if (completionRate >= 50 && !watchedRecordedForReel.current.get(reelId)) {
          watchedRecordedForReel.current.set(reelId, true);
          recordWatched(reelId, watchedSeconds, reelDuration);
        }

        // Negative Signal: SKIP (<2 sec when switching away)
        if (watchedSeconds < 2 && !viewedRecordedForReel.current.get(reelId)) {
          recordSkip(reelId, watchedSeconds, reelDuration);
        }
      }
      reelWatchStartMs.current.delete(reelId);
    };
  }, [currentReel, recordViewed, recordWatched, recordSkip]);

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

  // Handle video play/pause based on current index
  useEffect(() => {
    videoRefs.current.forEach((video, index) => {
      if (index === currentIndex && isPlaying) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, [currentIndex, isPlaying]);

  // Native scroll handler - detect which reel is visible
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    const scrollTop = container.scrollTop;
    const itemHeight = container.clientHeight;
    const newIndex = Math.round(scrollTop / itemHeight);
    
    if (newIndex !== currentIndex && newIndex >= 0 && newIndex < reels.length) {
      setCurrentIndex(newIndex);
      setIsPlaying(true);
    }
  }, [currentIndex, reels.length]);

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

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const handleVideoError = useCallback((reelId: string) => {
    setFailedVideoIds((prev) => {
      if (prev.has(reelId)) return prev;
      const next = new Set(prev);
      next.add(reelId);
      return next;
    });

    if (!errorToastShown.current.has(reelId)) {
      errorToastShown.current.add(reelId);
      toast.error("Видео недоступно");
    }
  }, []);

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
  }, [handleLike]);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-transparent flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white" />
      </div>
    );
  }

  const header = (
    <header className="sticky top-0 z-30 safe-area-top backdrop-blur-xl bg-black/20 border-b border-white/10">
      <div className="h-12 px-3 flex items-center justify-end">
        {user && (
          <button
            type="button"
            onClick={() => navigate("/create?tab=reels&auto=1")}
            className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center hover:bg-white/15 active:bg-white/20 transition-colors"
            aria-label="Создать Reel"
            title="Создать"
          >
            <Plus className="w-6 h-6 text-white" />
          </button>
        )}
      </div>
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
            <p className="text-white/60 text-center px-8">Нажмите + вверху, чтобы создать Reel</p>
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
        style={{
          scrollSnapType: 'y mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollBehavior: 'smooth',
        }}
      >
      {reels.map((reel, index) => (
        <div
          key={reel.id}
          ref={(el) => {
            if (el) reelElementRefs.current.set(index, el);
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
          <div className="absolute inset-0 overflow-hidden">
            {isProbablyVideoUrl(reel.video_url) && !failedVideoIds.has(reel.id) ? (
              <video
                ref={(el) => {
                  if (el) videoRefs.current.set(index, el);
                }}
                src={reel.video_url}
                poster={reel.thumbnail_url || undefined}
                className="w-full h-full object-cover"
                loop
                muted
                playsInline
                preload="auto"
                onError={() => handleVideoError(reel.id)}
                onPlay={() => handleVideoPlay(reel.id, reel.author_id)}
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
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

          {/* Right sidebar actions */}
          <div className="absolute right-3 bottom-8 flex flex-col items-center gap-4 z-10">
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
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center animate-spin-slow">
                  <Music2 className="w-4 h-4 text-white" />
                </div>
                <span className="text-white/80 text-sm">{reel.music_title}</span>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Progress indicator dots */}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
        {reels.slice(0, Math.min(5, reels.length)).map((_, index) => (
          <div 
            key={index}
            className={cn(
              "w-1.5 h-1.5 rounded-full transition-all duration-300",
              index === currentIndex % 5 
                ? "bg-white w-4" 
                : "bg-white/40"
            )}
          />
        ))}
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
