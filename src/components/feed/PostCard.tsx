import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal } from "lucide-react";
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
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const heartIdRef = useRef(0);
  
  
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
  const MIN_SWIPE_DISTANCE = 50;

  // Swipe handlers for image navigation
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > MIN_SWIPE_DISTANCE;
    const isRightSwipe = distance < -MIN_SWIPE_DISTANCE;

    if (isLeftSwipe && currentImageIndex < allImages.length - 1) {
      setCurrentImageIndex(currentImageIndex + 1);
    } else if (isRightSwipe && currentImageIndex > 0) {
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

  const handleDoubleTap = (e: React.MouseEvent) => {
    if (!id) return;
    if (!liked) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const newHeart = { id: heartIdRef.current++, x, y };
      setFloatingHearts(prev => [...prev, newHeart]);
      
      setTimeout(() => {
        setFloatingHearts(prev => prev.filter(h => h.id !== newHeart.id));
      }, 1000);

      setLikeAnimation(true);
      setTimeout(() => setLikeAnimation(false), 300);

      // Persist like in DB (single source of truth).
      void handleLike();
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
              <span 
                className="font-semibold text-foreground text-sm cursor-pointer hover:underline"
                onClick={goToProfile}
              >
                {author.username}
              </span>
              {author.verified && <VerifiedBadge size="sm" />}
            </div>
            {isRecommended && (
              <p className="text-xs text-muted-foreground">Рекомендации для вас</p>
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

      {/* Image Carousel */}
      {allImages.length > 0 && (
        <div 
          className="relative aspect-square cursor-pointer select-none"
          onDoubleClick={handleDoubleTap}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <img
            src={allImages[currentImageIndex]}
            alt="Post image"
            className="w-full h-full object-cover"
          />
          
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

      {/* Caption */}
      <div className="px-4 py-2">
        <p className="text-sm">
          <span className="font-semibold">{author.username}</span>{" "}
          <span className="text-foreground">{truncatedContent}</span>
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

      {/* Time & Translation */}
      <div className="px-4 pb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <span>{timeAgo}</span>
        <span>·</span>
        <button className="hover:text-foreground transition-colors">
          Показать перевод
        </button>
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
