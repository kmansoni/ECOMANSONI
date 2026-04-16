import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Heart, MessageCircle, Share2, Bookmark, MoreHorizontal } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useLikeActions } from "@/hooks/useLikeActions";
import { batchGetPostLikes, batchGetSavedPosts } from "@/lib/likes";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CommentsSheet } from "@/components/feed/CommentsSheet";
import { ShareSheet } from "@/components/feed/ShareSheet";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { logger } from "@/lib/logger";

interface PostDetail {
  id: string;
  content: string | null;
  author_id: string;
  likes_count: number;
  comments_count: number;
  saves_count: number;
  shares_count: number;
  views_count: number;
  created_at: string;
  author?: {
    display_name: string | null;
    avatar_url: string | null;
  };
  media: {
    media_url: string;
    media_type: string;
  }[];
  isLiked: boolean;
  isSaved: boolean;
}

interface PostRow {
  id: string;
  content: string | null;
  author_id: string;
  likes_count?: number | null;
  comments_count?: number | null;
  saves_count?: number | null;
  shares_count?: number | null;
  views_count?: number | null;
  created_at: string;
}

const clampCounter = (value: number | null | undefined) => Math.max(0, Number.isFinite(value as number) ? Number(value) : 0);

export function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { togglePostLike } = useLikeActions();

  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [frameAspectRatio, setFrameAspectRatio] = useState(1);

  // useRef for pending guards — prevents re-render loops (consistent with PostCard)
  const likePendingRef = useRef(false);
  const savePendingRef = useRef(false);

  const applyAspectRatio = (width: number, height: number) => {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    const next = Math.min(1.91, Math.max(0.56, width / height));
    setFrameAspectRatio((prev) => (Math.abs(prev - next) < 0.01 ? prev : next));
  };

  useEffect(() => {
    if (!id) return;

    const fetchPost = async () => {
      try {
        // Fetch post
        const { data: postData, error: postError } = await supabase
          .from("posts")
          .select("*")
          .eq("id", id)
          .single();

        if (postError) throw postError;

        // Fetch author profile and media in parallel
        const [profileRes, mediaRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("display_name, avatar_url")
            .eq("user_id", postData.author_id)
            .single(),
          supabase
            .from("post_media")
            .select("media_url, media_type")
            .eq("post_id", id)
            .order("sort_order", { ascending: true }),
        ]);

        // Batch check liked & saved status via unified likes module
        let isLiked = false;
        let isSaved = false;
        if (user) {
          const [likedSet, savedSet] = await Promise.all([
            batchGetPostLikes([id], user.id),
            batchGetSavedPosts([id], user.id),
          ]);
          isLiked = likedSet.has(id);
          isSaved = savedSet.has(id);
        }

        const row = postData as unknown as PostRow;
        setPost({
          id: row.id,
          content: row.content,
          author_id: row.author_id,
          created_at: row.created_at,
          likes_count: clampCounter(row.likes_count),
          comments_count: clampCounter(row.comments_count),
          saves_count: clampCounter(row.saves_count),
          shares_count: clampCounter(row.shares_count),
          views_count: clampCounter(row.views_count),
          author: profileRes.data || undefined,
          media: mediaRes.data || [],
          isLiked,
          isSaved,
        });
      } catch (error) {
        logger.error("[PostDetailPage] Error fetching post", { error });
        setFetchError(error instanceof Error ? error.message : "Не удалось загрузить пост");
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
  }, [id, user]);

  const handleLike = async () => {
    if (!post || !user || likePendingRef.current) return;
    likePendingRef.current = true;

    const prevLiked = post.isLiked;
    const prevCount = post.likes_count;

    // Optimistic update
    setPost((p) => p ? { ...p, isLiked: !prevLiked, likes_count: prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1 } : p);

    try {
      const { error } = await togglePostLike(post.id, prevLiked);
      if (error) {
        // Rollback on error
        setPost((p) => p ? { ...p, isLiked: prevLiked, likes_count: prevCount } : p);
        logger.error("[PostDetailPage] Like error", { error });
      }
    } finally {
      // Always release the lock — guards against unexpected throws from togglePostLike
      likePendingRef.current = false;
    }
  };

  const handleSave = async () => {
    if (!post || !user || savePendingRef.current) return;
    savePendingRef.current = true;

    const prevSaved = post.isSaved;
    const prevCount = post.saves_count;

    // Optimistic update
    setPost((p) => p ? { ...p, isSaved: !prevSaved, saves_count: prevSaved ? Math.max(0, prevCount - 1) : prevCount + 1 } : p);

    try {
      if (prevSaved) {
        const { error } = await supabase
          .from("saved_posts")
          .delete()
          .eq("post_id", post.id)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("saved_posts")
          .insert({ post_id: post.id, user_id: user.id });
        if (error) throw error;
      }
    } catch (error) {
      // Rollback on error
      setPost((p) => p ? { ...p, isSaved: prevSaved, saves_count: prevCount } : p);
      logger.error("[PostDetailPage] Save error", { error });
    } finally {
      savePendingRef.current = false;
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ru });
    } catch {
      return "";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <h2 className="text-xl font-semibold mb-2">Ошибка загрузки</h2>
        <p className="text-muted-foreground mb-4">{fetchError}</p>
        <Button onClick={() => navigate(-1)}>Назад</Button>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <h2 className="text-xl font-semibold mb-2">Пост не найден</h2>
        <p className="text-muted-foreground mb-4">Возможно, он был удалён</p>
        <Button onClick={() => navigate(-1)}>Назад</Button>
      </div>
    );
  }

  const currentMedia = post.media[currentImageIndex];
  const currentIsVideo = !!currentMedia && (
    (currentMedia.media_type || "").startsWith("video") ||
    /\.(mp4|webm|mov|m4v)(\?|$)/i.test(currentMedia.media_url)
  );

  const authorName = post.author?.display_name || "Пользователь";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate(-1)} className="p-1">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="font-semibold">Публикация</h1>
        </div>
      </div>

      {/* Post Content */}
      <div className="pb-20">
        {/* Author header */}
        <div className="flex items-center gap-3 px-4 py-3">
          <Avatar className="w-10 h-10">
            <AvatarImage src={post.author?.avatar_url || undefined} alt={authorName} />
            <AvatarFallback className="bg-muted text-muted-foreground font-semibold">
              {authorName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="font-semibold text-sm">{authorName}</p>
            <p className="text-xs text-muted-foreground">{formatTime(post.created_at)}</p>
          </div>
          <button className="p-2">
            <MoreHorizontal className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Media */}
        {post.media.length > 0 && (
          <div className="relative media-frame media-frame--post" style={{ aspectRatio: frameAspectRatio }}>
            {currentIsVideo ? (
              <video
                src={currentMedia?.media_url}
                className="media-object media-object--fill media-object--cover"
                autoPlay
                loop
                muted
                playsInline
                onLoadedMetadata={(e) => {
                  const el = e.currentTarget;
                  applyAspectRatio(el.videoWidth, el.videoHeight);
                }}
              />
            ) : (
              <img loading="lazy"
                src={currentMedia?.media_url}
                alt=""
                className="media-object media-object--fill media-object--cover"
                onLoad={(e) => {
                  const el = e.currentTarget;
                  applyAspectRatio(el.naturalWidth, el.naturalHeight);
                }}
              />
            )}
            {post.media.length > 1 && (
              <>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1">
                  {post.media.map((_, idx) => (
                    <div
                      key={idx}
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${
                        idx === currentImageIndex ? "bg-white" : "bg-white/50"
                      }`}
                    />
                  ))}
                </div>
                <div className="absolute inset-0 flex">
                  <button
                    className="flex-1"
                    onClick={() => setCurrentImageIndex((prev) => Math.max(0, prev - 1))}
                  />
                  <button
                    className="flex-1"
                    onClick={() => setCurrentImageIndex((prev) => Math.min(post.media.length - 1, prev + 1))}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <button onClick={handleLike} className="flex items-center gap-1">
              <Heart
                className={`w-6 h-6 transition-colors ${
                  post.isLiked ? "fill-red-500 text-red-500" : ""
                }`}
              />
              <span className="text-sm font-medium">{post.likes_count}</span>
            </button>
            <button onClick={() => setShowComments(true)} className="flex items-center gap-1">
              <MessageCircle className="w-6 h-6" />
              <span className="text-sm font-medium">{post.comments_count}</span>
            </button>
            <button onClick={() => setShowShare(true)} className="flex items-center gap-1">
              <Share2 className="w-6 h-6" />
              <span className="text-sm font-medium">{post.shares_count}</span>
            </button>
          </div>
          <button onClick={handleSave} className="flex items-center gap-1">
            <Bookmark
              className={`w-6 h-6 transition-colors ${
                post.isSaved ? "fill-foreground" : ""
              }`}
            />
            <span className="text-sm font-medium">{post.saves_count}</span>
          </button>
        </div>

        {/* Content */}
        {post.content && (
          <div className="px-4 pb-4">
            <p className="text-sm">
              <span className="font-semibold mr-1">{authorName}</span>
              {post.content}
            </p>
          </div>
        )}

        {/* Views */}
        <div className="px-4 pb-4">
          <p className="text-xs text-muted-foreground">{post.views_count} просмотров</p>
        </div>
      </div>

      {/* Comments Sheet */}
      <CommentsSheet
        isOpen={showComments}
        onClose={() => setShowComments(false)}
        postId={post.id}
        commentsCount={post.comments_count}
        onCommentsCountChange={(count) => setPost((prev) => (prev ? { ...prev, comments_count: count } : prev))}
      />

      {/* Share Sheet */}
      <ShareSheet
        isOpen={showShare}
        onClose={() => setShowShare(false)}
        postId={post.id}
        onShareSuccess={(sharedToCount) => {
          setPost((prev) =>
            prev ? { ...prev, shares_count: prev.shares_count + Math.max(1, sharedToCount) } : prev,
          );
        }}
      />
    </div>
  );
}
