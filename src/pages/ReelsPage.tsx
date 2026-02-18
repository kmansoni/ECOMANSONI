import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
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
import { CreateReelSheet } from "@/components/reels/CreateReelSheet";
import { ReelCommentsSheet } from "@/components/reels/ReelCommentsSheet";
import { ReelShareSheet } from "@/components/reels/ReelShareSheet";
import { Button } from "@/components/ui/button";
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

export function ReelsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { reels, loading, toggleLike, recordView, refetch } = useReels();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [commentsReelId, setCommentsReelId] = useState<string | null>(null);
  const [shareReelId, setShareReelId] = useState<string | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const viewedReels = useRef<Set<string>>(new Set());
  const isScrolling = useRef(false);

  const currentReel = reels[currentIndex];

  // Record view when reel changes
  useEffect(() => {
    if (currentReel && !viewedReels.current.has(currentReel.id)) {
      viewedReels.current.add(currentReel.id);
      recordView(currentReel.id);
    }
  }, [currentReel, recordView]);

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

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

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
      <div className="min-h-[calc(100vh-4rem)] bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white" />
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-black flex flex-col items-center justify-center text-white">
        <Play className="w-16 h-16 mb-4 opacity-40" />
        <h2 className="text-lg font-semibold mb-2">Нет Reels</h2>
        <p className="text-white/60 text-center px-8 mb-6">
          Пока нет видео для просмотра. Будьте первым!
        </p>
        {user && (
          <Button
            onClick={() => setShowCreateSheet(true)}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Создать Reel
          </Button>
        )}
        <CreateReelSheet open={showCreateSheet} onOpenChange={setShowCreateSheet} />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-[calc(100vh-4rem)] bg-black overflow-y-scroll overflow-x-hidden"
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
          className="relative w-full h-[calc(100vh-4rem)] flex-shrink-0"
          style={{
            scrollSnapAlign: 'start',
            scrollSnapStop: 'always',
          }}
          onClick={() => handleDoubleTap(reel.id, reel.isLiked || false)}
        >
          {/* Video/Image Background */}
          <div className="absolute inset-0 overflow-hidden">
            {reel.video_url.includes(".mp4") || reel.video_url.includes("video") ? (
              <video
                ref={(el) => {
                  if (el) videoRefs.current.set(index, el);
                }}
                src={reel.video_url}
                className="w-full h-full object-cover"
                loop
                muted
                playsInline
                preload="auto"
              />
            ) : (
              <img
                src={reel.video_url}
                alt=""
                className="w-full h-full object-cover"
              />
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

            {/* Save */}
            <button className="flex flex-col items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
                <Bookmark className="w-6 h-6 text-white" />
              </div>
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
              {reel.author?.verified && <VerifiedBadge size="sm" className="text-white fill-white stroke-white/80" />}
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

      <CreateReelSheet open={showCreateSheet} onOpenChange={setShowCreateSheet} />
      
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
