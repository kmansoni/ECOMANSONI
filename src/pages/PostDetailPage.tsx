import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Heart, MessageCircle, Share2, Bookmark, MoreHorizontal } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { CommentsSheet } from "@/components/feed/CommentsSheet";
import { ShareSheet } from "@/components/feed/ShareSheet";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

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
  isLiked?: boolean;
  isSaved?: boolean;
}

const clampCounter = (value: number | null | undefined) => Math.max(0, Number.isFinite(value as number) ? Number(value) : 0);

export function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [likePending, setLikePending] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [frameAspectRatio, setFrameAspectRatio] = useState(1);

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

        // Fetch author profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("user_id", postData.author_id)
          .single();

        // Fetch post media
        const { data: media } = await supabase
          .from("post_media")
          .select("media_url, media_type")
          .eq("post_id", id)
          .order("sort_order", { ascending: true });

        // Check if liked
        let isLiked = false;
        if (user) {
          const { data: likeData } = await supabase
            .from("post_likes")
            .select("id")
            .eq("post_id", id)
            .eq("user_id", user.id)
            .maybeSingle();
          isLiked = !!likeData;
        }

        // Check if saved
        let isSaved = false;
        if (user) {
          const { data: savedData } = await supabase
            .from("saved_posts")
            .select("id")
            .eq("post_id", id)
            .eq("user_id", user.id)
            .maybeSingle();
          isSaved = !!savedData;
        }

        setPost({
          ...postData,
          likes_count: clampCounter(postData.likes_count),
          comments_count: clampCounter(postData.comments_count),
          saves_count: clampCounter(postData.saves_count),
          shares_count: clampCounter(postData.shares_count),
          views_count: clampCounter(postData.views_count),
          author: profile || undefined,
          media: media || [],
          isLiked,
          isSaved,
        });
      } catch (error) {
        console.error("Error fetching post:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
  }, [id, user]);

  const handleLike = async () => {
    if (!post || !user || likePending) return;

    try {
      setLikePending(true);
      if (post.isLiked) {
        const { error } = await supabase
          .from("post_likes")
          .delete()
          .eq("post_id", post.id)
          .eq("user_id", user.id);
        if (error) throw error;
        setPost({ ...post, isLiked: false, likes_count: post.likes_count - 1 });
      } else {
        const { error } = await supabase
          .from("post_likes")
          .insert({ post_id: post.id, user_id: user.id });
        if (error) throw error;
        setPost({ ...post, isLiked: true, likes_count: post.likes_count + 1 });
      }
    } catch (error) {
      console.error("Error toggling like:", error);
    } finally {
      setLikePending(false);
    }
  };

  const handleSave = async () => {
    if (!post || !user || savePending) return;

    try {
      setSavePending(true);
      if (post.isSaved) {
        const { error } = await supabase
          .from("saved_posts")
          .delete()
          .eq("post_id", post.id)
          .eq("user_id", user.id);
        if (error) throw error;
        setPost({ ...post, isSaved: false, saves_count: Math.max(0, (post.saves_count || 0) - 1) });
      } else {
        const { error } = await supabase
          .from("saved_posts")
          .insert({ post_id: post.id, user_id: user.id });
        if (error) throw error;
        setPost({ ...post, isSaved: true, saves_count: (post.saves_count || 0) + 1 });
      }
    } catch (error) {
      console.error("Error toggling save:", error);
    } finally {
      setSavePending(false);
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
  const authorAvatar = post.author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author_id}`;

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
          <img
            src={authorAvatar}
            alt={authorName}
            className="w-10 h-10 rounded-full object-cover"
          />
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
              <img
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
