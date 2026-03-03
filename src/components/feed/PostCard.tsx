import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, Pin } from "lucide-react";
import { WhyRecommended } from "./WhyRecommended";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { CommentsSheet } from "./CommentsSheet";
import { ShareSheet } from "./ShareSheet";
import { PostOptionsSheet } from "./PostOptionsSheet";
import { usePostActions } from "@/hooks/usePosts";
import { useSavedPosts } from "@/hooks/useSavedPosts";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { LocationTag } from "./LocationTag";
import { PostReminder } from "./PostReminder";

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

export function PostCard({
  id,
  authorId,
  author,
  content,
  image,
  images,
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
  const [liked, setLiked] = useState(isLiked);
  const [likeCount, setLikeCount] = useState(likes);
  const [likePending, setLikePending] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [likeAnimation, setLikeAnimation] = useState(false);
  const [floatingHearts, setFloatingHearts] = useState<{ id: number; x: number; y: number }[]>([]);
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
    setLikeCount(likes);
  }, [id, likes, likePending]);
  
  const handleSave = async () => {
    if (!id) return;
    try {
      await toggleSave(id);
    } catch (err) {
      console.error('Failed to toggle save:', err);
    }
  };


  const allImages = images || (image ? [image] : []);
  const hasMultipleImages = allImages.length > 1;
  const MIN_SWIPE = 50;

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
    if (dx < 0 && currentImageIndex < allImages.length - 1) {
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
      {allImages.length > 0 && (
        <div
          className="relative media-frame media-frame--post cursor-pointer select-none overflow-hidden"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* Слайдер с плавной анимацией */}
          <div
            className="flex transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${currentImageIndex * 100}%)` }}
          >
            {allImages.map((src, idx) => {
              const isVideo = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(src) || (idx === 0 && !image && images);
              return isVideo ? (
                <video
                  key={idx}
                  src={src}
                  className="media-object media-object--fill media-object--cover shrink-0 w-full"
                  autoPlay={idx === currentImageIndex}
                  loop
                  muted
                  playsInline
                />
              ) : (
                <img
                  key={idx}
                  src={src}
                  alt={altText || `Post ${idx + 1}`}
                  className="media-object media-object--fill media-object--cover shrink-0 w-full"
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
              {currentImageIndex + 1}/{allImages.length}
            </div>
          )}


          {/* Dots indicator */}
          {hasMultipleImages && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1">
              {allImages.map((_, index) => (
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
            <span className="text-sm">{formatNumber(likeCount)}</span>
          </button>
          <button 
            className="flex items-center gap-1.5 text-foreground"
            onClick={() => setShowComments(true)}
          >
            <MessageCircle className="w-6 h-6" />
            <span className="text-sm">{formatNumber(comments)}</span>
          </button>
          <button 
            className="flex items-center gap-1.5 text-foreground"
            onClick={() => setShowShare(true)}
          >
            <Send className="w-6 h-6" />
          </button>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            className={cn(
              "transition-colors",
              saved ? "text-primary" : "text-foreground"
            )}
          >
            <Bookmark className={cn("w-6 h-6", saved && "fill-current")} />
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

      {/* Comments Sheet */}
      {id && (
        <>
          <CommentsSheet
            isOpen={showComments}
            onClose={() => setShowComments(false)}
            postId={id}
            commentsCount={comments}
          />
          <ShareSheet
            isOpen={showShare}
            onClose={() => setShowShare(false)}
            postId={id}
            postContent={content}
            postImage={allImages[0]}
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
