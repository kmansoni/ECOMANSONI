import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, Pin } from "lucide-react";
import { WhyRecommended } from "./WhyRecommended";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { CommentsSheet } from "./CommentsSheet";
import { LikesSheet } from "./LikesSheet";
import { ShareSheet } from "./ShareSheet";
import { PostOptionsSheet } from "./PostOptionsSheet";
import { usePostActions } from "@/hooks/usePosts";
import { useSavedPosts } from "@/hooks/useSavedPosts";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { LocationTag } from "./LocationTag";
import { PostReminder } from "./PostReminder";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";

interface PostCardProps {
  id?: string;
  authorId?: string;
  author: {
    name: string;
    username: string;
    avatar: string;
    verified?: boolean;
  };
  content: string;
  image?: string;
  images?: string[];
  mediaItems?: {
    url: string;
    type?: string | null;
  }[];
  likes: number;
  comments: number;
  shares: number;
  saves?: number;
  timeAgo: string;
  isRecommended?: boolean;
  isLiked?: boolean;
  onLikeChange?: (postId: string, liked: boolean) => void;
  // New fields
  locationName?: string;
  locationLat?: number;
  locationLng?: number;
  altText?: string;
  isPaidPartnership?: boolean;
  pinPosition?: number | null;
}

const clampCounter = (value: number) => Math.max(0, Number.isFinite(value) ? value : 0);

export function PostCard({
  id,
  authorId,
  author,
  content,
  image,
  images,
  mediaItems,
  likes,
  comments,
  shares,
  saves = 0,
  timeAgo,
  isRecommended = false,
  isLiked = false,
  onLikeChange,
  locationName,
  locationLat,
  locationLng,
  altText,
  isPaidPartnership = false,
  pinPosition,
}: PostCardProps) {
  const navigate = useNavigate();
  const { toggleLike } = usePostActions();
  const { isSaved, toggleSave } = useSavedPosts();
  const haptic = useHapticFeedback();
  const [liked, setLiked] = useState(isLiked);
  const [likeCount, setLikeCount] = useState(clampCounter(likes));
  const [commentCount, setCommentCount] = useState(clampCounter(comments));
  const [shareCount, setShareCount] = useState(clampCounter(shares));
  const [saveCount, setSaveCount] = useState(clampCounter(saves));
  const [likePending, setLikePending] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showLikes, setShowLikes] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [likeAnimation, setLikeAnimation] = useState(false);
  const [floatingHearts, setFloatingHearts] = useState<{ id: number; x: number; y: number }[]>([]);
  const [frameAspectRatio, setFrameAspectRatio] = useState(1);
  const imageRefs = useRef<(HTMLImageElement | null)[]>([]);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const heartIdRef = useRef(0);
  // Touch double-tap detection
  const lastTapRef = useRef<number>(0);
  const lastTapXRef = useRef<number>(0);
  const lastTapYRef = useRef<number>(0);
  // Carousel swipe
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  
  
  const saved = id ? isSaved(id) : false;

  // Keep local UI state synced with upstream props (refetch/realtime), but avoid clobbering mid-request.
  useEffect(() => {
    if (likePending) return;
    setLiked(isLiked);
  }, [id, isLiked, likePending]);

  useEffect(() => {
    if (likePending) return;
    setLikeCount(clampCounter(likes));
  }, [id, likes, likePending]);

  useEffect(() => {
    setCommentCount(clampCounter(comments));
  }, [id, comments]);

  useEffect(() => {
    setShareCount(clampCounter(shares));
  }, [id, shares]);

  useEffect(() => {
    setSaveCount(clampCounter(saves));
  }, [id, saves]);
  
  const handleSave = async () => {
    if (!id || savePending) return;

    const prevSaved = saved;
    const prevCount = saveCount;
    setSaveCount((count) => (prevSaved ? Math.max(0, count - 1) : count + 1));
    setSavePending(true);

    try {
      await toggleSave(id);
    } catch (err) {
      setSaveCount(prevCount);
      console.error('Failed to toggle save:', err);
    } finally {
      setSavePending(false);
    }
  };


  const allMedia = useMemo(() => {
    if (mediaItems && mediaItems.length > 0) {
      return mediaItems
        .filter((item) => typeof item?.url === "string" && item.url.trim().length > 0)
        .map((item) => ({
          url: item.url,
          type: item.type ?? undefined,
        }));
    }

    const fallback = images || (image ? [image] : []);
    return fallback
      .filter((src): src is string => typeof src === "string" && src.trim().length > 0)
      .map((src) => ({
        url: src,
        type: undefined,
      }));
  }, [image, images, mediaItems]);

  const hasMultipleImages = allMedia.length > 1;
  const MIN_SWIPE = 50;

  useEffect(() => {
    setCurrentImageIndex(0);
    setFrameAspectRatio(1);
  }, [id, allMedia.length]);

  const applyAspectRatio = (width: number, height: number) => {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    // Keep ratio in a sane feed range to avoid extreme layout jumps.
    const next = Math.min(1.91, Math.max(0.56, width / height));
    setFrameAspectRatio((prev) => (Math.abs(prev - next) < 0.01 ? prev : next));
  };

  const isVideoMedia = (media: { url: string; type?: string | null }) => {
    return (media.type ?? "").startsWith("video") || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(media.url);
  };

  useEffect(() => {
    const active = allMedia[currentImageIndex];
    if (!active) return;

    if (isVideoMedia(active)) {
      const el = videoRefs.current[currentImageIndex];
      if (el && el.videoWidth > 0 && el.videoHeight > 0) {
        applyAspectRatio(el.videoWidth, el.videoHeight);
      }
      return;
    }

    const el = imageRefs.current[currentImageIndex];
    if (el && el.naturalWidth > 0 && el.naturalHeight > 0) {
      applyAspectRatio(el.naturalWidth, el.naturalHeight);
    }
  }, [allMedia, currentImageIndex]);

  // Swipe/double-tap handlers
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartXRef.current = t.clientX;
    touchStartYRef.current = t.clientY;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    if (!t || touchStartXRef.current == null) return;

    const dx = t.clientX - touchStartXRef.current;
    const dy = t.clientY - (touchStartYRef.current ?? t.clientY);
    touchStartXRef.current = null;
    touchStartYRef.current = null;

    // Double-tap → like
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < 300 && Math.abs(t.clientX - lastTapXRef.current) < 40 && Math.abs(t.clientY - lastTapYRef.current) < 40;
    if (isDoubleTap && Math.abs(dx) < 20 && Math.abs(dy) < 20) {
      lastTapRef.current = 0;
      if (!liked && id) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = t.clientX - rect.left;
        const y = t.clientY - rect.top;
        const newHeart = { id: heartIdRef.current++, x, y };
        setFloatingHearts(prev => [...prev, newHeart]);
        setTimeout(() => setFloatingHearts(prev => prev.filter(h => h.id !== newHeart.id)), 1000);
        setLikeAnimation(true);
        setTimeout(() => setLikeAnimation(false), 300);
        void handleLike();
      }
      return;
    }
    lastTapRef.current = now;
    lastTapXRef.current = t.clientX;
    lastTapYRef.current = t.clientY;

    // Swipe carousel
    if (Math.abs(dx) < MIN_SWIPE || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0 && currentImageIndex < allMedia.length - 1) {
      setCurrentImageIndex(currentImageIndex + 1);
    } else if (dx > 0 && currentImageIndex > 0) {
      setCurrentImageIndex(currentImageIndex - 1);
    }
  };

  const handleLike = async () => {
    if (!id || likePending) return;

    const prevLiked = liked;
    const prevCount = likeCount;

    if (!liked) {
      setLikeAnimation(true);
      setTimeout(() => setLikeAnimation(false), 300);
      void haptic.light(); // Instagram-style haptic on like
    }
    
    const nextLiked = !prevLiked;
    setLiked(nextLiked);
    setLikeCount(prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1);

    setLikePending(true);
    try {
      const { error } = await toggleLike(id, prevLiked);
      if (error) {
        setLiked(prevLiked);
        setLikeCount(prevCount);
      } else {
        onLikeChange?.(id, nextLiked);
      }
    } finally {
      setLikePending(false);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1).replace(/\.0$/, '') + " млн";
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1).replace(/\.0$/, '') + " тыс.";
    }
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  };

  const truncatedContent = content.length > 100 && !expanded 
    ? content.slice(0, 100) + "..." 
    : content;

  const goToProfile = () => {
    // Use authorId (user_id) for reliable navigation
    if (authorId) {
      navigate(`/user/${authorId}`);
    }
  };

  return (
    <div className="bg-white/50 dark:bg-card backdrop-blur-sm border-b border-white/60 dark:border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="relative cursor-pointer" onClick={goToProfile}>
            <img
              src={author.avatar}
              alt={author.name}
              className="w-10 h-10 rounded-full object-cover ring-2 ring-primary/20"
            />
            {author.verified && (
              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                <VerifiedBadge size="xs" className="text-primary-foreground fill-primary-foreground stroke-primary" />
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1">
              {pinPosition && <Pin className="w-3.5 h-3.5 text-muted-foreground" />}
              <span
                className="font-semibold text-foreground text-sm cursor-pointer hover:underline"
                onClick={goToProfile}
              >
                {author.username}
              </span>
              {author.verified && <VerifiedBadge size="sm" />}
            </div>
            {isPaidPartnership && (
              <p className="text-xs text-muted-foreground">Платное партнёрство</p>
            )}
            {isRecommended && !isPaidPartnership && id && (
              <WhyRecommended postId={id} reason="interests" />
            )}
            {locationName && (
              <LocationTag name={locationName} lat={locationLat} lng={locationLng} />
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-muted-foreground h-8 w-8"
            onClick={() => setShowOptions(true)}
          >
            <MoreHorizontal className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Image/Video Carousel */}
      {allMedia.length > 0 && (
        <div
          className="relative media-frame media-frame--post cursor-pointer select-none overflow-hidden"
          style={{ aspectRatio: frameAspectRatio }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* Слайдер с плавной анимацией */}
          <div
            className="flex transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${currentImageIndex * 100}%)` }}
          >
            {allMedia.map((media, idx) => {
              const isVideo = isVideoMedia(media);
              return isVideo ? (
                <video
                  key={idx}
                  src={media.url}
                  ref={(el) => {
                    videoRefs.current[idx] = el;
                  }}
                  className="media-object media-object--fill media-object--cover shrink-0 w-full"
                  autoPlay={idx === currentImageIndex}
                  loop
                  muted
                  playsInline
                  onLoadedMetadata={(e) => {
                    if (idx !== currentImageIndex) return;
                    const el = e.currentTarget;
                    applyAspectRatio(el.videoWidth, el.videoHeight);
                  }}
                />
              ) : (
                <img
                  key={idx}
                  src={media.url}
                  ref={(el) => {
                    imageRefs.current[idx] = el;
                  }}
                  alt={altText || `Post ${idx + 1}`}
                  className="media-object media-object--fill media-object--cover shrink-0 w-full"
                  onLoad={(e) => {
                    if (idx !== currentImageIndex) return;
                    const el = e.currentTarget;
                    applyAspectRatio(el.naturalWidth, el.naturalHeight);
                  }}
                />
              );
            })}
          </div>
          
          {/* Floating hearts on double tap */}
          {floatingHearts.map((heart) => (
            <div
              key={heart.id}
              className="absolute pointer-events-none animate-float-heart"
              style={{ left: heart.x - 30, top: heart.y - 30 }}
            >
              <Heart className="w-16 h-16 text-destructive fill-current drop-shadow-lg" />
            </div>
          ))}
          
          {/* Image counter */}
          {hasMultipleImages && (
            <div className="absolute top-3 right-3 bg-black/60 text-white text-xs font-medium px-2 py-1 rounded-full">
              {currentImageIndex + 1}/{allMedia.length}
            </div>
          )}


          {/* Dots indicator */}
          {hasMultipleImages && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1">
              {allMedia.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentImageIndex(index)}
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-all",
                    index === currentImageIndex 
                      ? "bg-primary w-2" 
                      : "bg-white/60"
                  )}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions with Stats */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-5">
          <button
            onClick={handleLike}
            className={cn(
              "flex items-center gap-1.5 transition-all",
              liked ? "text-destructive" : "text-foreground"
            )}
          >
            <Heart
              className={cn(
                "w-6 h-6 transition-transform",
                liked && "fill-current",
                likeAnimation && "animate-like-bounce"
              )}
            />
          </button>
          {/* Tap on like count → open "who liked" sheet (Instagram behaviour) */}
          <button
            className={cn(
              "text-sm transition-colors",
              liked ? "text-destructive" : "text-foreground"
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (id && likeCount > 0) setShowLikes(true);
            }}
            aria-label="Посмотреть кто поставил лайк"
          >
            {formatNumber(likeCount)}
          </button>
          <button 
            className="flex items-center gap-1.5 text-foreground"
            onClick={() => setShowComments(true)}
          >
            <MessageCircle className="w-6 h-6" />
            <span className="text-sm">{formatNumber(commentCount)}</span>
          </button>
          <button 
            className="flex items-center gap-1.5 text-foreground"
            onClick={() => setShowShare(true)}
          >
            <Send className="w-6 h-6" />
            <span className="text-sm">{formatNumber(shareCount)}</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            className={cn(
              "transition-colors flex items-center gap-1.5",
              saved ? "text-primary" : "text-foreground"
            )}
          >
            <Bookmark className={cn("w-6 h-6", saved && "fill-current")} />
            {saveCount > 0 && <span className="text-sm">{formatNumber(saveCount)}</span>}
          </button>
        </div>
      </div>

      {/* Caption with clickable hashtags */}
      <div className="px-4 py-2">
        <p className="text-sm">
          <span className="font-semibold">{author.username}</span>{" "}
          <CaptionText text={truncatedContent} navigate={navigate} />
          {content.length > 100 && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="text-muted-foreground ml-1"
            >
              ещё
            </button>
          )}
        </p>
      </div>

      {/* Time + Reminder */}
      <div className="px-4 pb-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{timeAgo}</span>
        {id && <PostReminder postId={id} />}
      </div>

      {/* Likes Sheet */}
      {id && likeCount > 0 && (
        <LikesSheet
          postId={id}
          likeCount={likeCount}
          isOpen={showLikes}
          onClose={() => setShowLikes(false)}
        />
      )}

      {/* Comments Sheet */}
      {id && (
        <>
          <CommentsSheet
            isOpen={showComments}
            onClose={() => setShowComments(false)}
            postId={id}
            commentsCount={commentCount}
            onCommentsCountChange={setCommentCount}
          />
          <ShareSheet
            isOpen={showShare}
            onClose={() => setShowShare(false)}
            postId={id}
            onShareSuccess={(sharedToCount) => {
              setShareCount((prev) => prev + Math.max(1, sharedToCount));
            }}
          />
          {authorId && (
            <PostOptionsSheet
              isOpen={showOptions}
              onClose={() => setShowOptions(false)}
              postId={id}
              authorId={authorId}
              authorUsername={author.username}
            />
          )}
        </>
      )}
    </div>
  );
}

// Компонент для текста с кликабельными хэштегами
function CaptionText({
  text,
  navigate,
}: {
  text: string;
  navigate: ReturnType<typeof import("react-router-dom").useNavigate>;
}) {
  const parts = text.split(/(#[\wа-яёА-ЯЁ]+)/gi);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("#") ? (
          <button
            key={i}
            className="text-primary font-medium hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/explore?tag=${encodeURIComponent(part.slice(1))}`);
            }}
          >
            {part}
          </button>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
