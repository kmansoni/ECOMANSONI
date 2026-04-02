import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { PostCard } from "@/components/feed/PostCard";
import { batchGetPostLikes, batchGetSavedPosts } from "@/lib/likes";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import type { Database } from "@/integrations/supabase/types";
import type { ProfileWithStats } from "@/hooks/useProfile";

type PostRow = Database["public"]["Tables"]["posts"]["Row"];
type PostMediaRow = Database["public"]["Tables"]["post_media"]["Row"];
type PostWithMedia = PostRow & { post_media: PostMediaRow[] };

interface ProfilePostFeedProps {
  posts: PostWithMedia[];
  profile: ProfileWithStats;
  initialPostId: string;
  pinnedPostIds: Set<string>;
  onClose: () => void;
  onPinChanged: () => void;
}

function formatTimeAgo(dateString: string): string {
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: false, locale: ru });
  } catch {
    return "";
  }
}

export function ProfilePostFeed({
  posts,
  profile,
  initialPostId,
  pinnedPostIds,
  onClose,
  onPinChanged,
}: ProfilePostFeedProps) {
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const postRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [savedPostIds, setSavedPostIds] = useState<Set<string>>(new Set());
  // Local counter overrides — tracks likes_count changes from user interactions
  const [counterOverrides, setCounterOverrides] = useState<Record<string, number>>({});
  const [didScroll, setDidScroll] = useState(false);

  // Batch fetch liked & saved status via unified likes module
  useEffect(() => {
    if (!user || posts.length === 0) return;
    const ids = posts.map((p) => p.id);

    Promise.all([
      batchGetPostLikes(ids, user.id),
      batchGetSavedPosts(ids, user.id),
    ]).then(([liked, saved]) => {
      setLikedPostIds(liked);
      setSavedPostIds(saved);
    });
  }, [user, posts]);

  // Scroll to initial post after mount animation
  useEffect(() => {
    if (didScroll) return;
    const timer = setTimeout(() => {
      const el = postRefs.current[initialPostId];
      if (el) {
        el.scrollIntoView({ behavior: "instant", block: "start" });
      }
      setDidScroll(true);
    }, 350);
    return () => clearTimeout(timer);
  }, [initialPostId, didScroll]);

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Browser back button closes overlay
  useEffect(() => {
    window.history.pushState({ profileFeed: true }, "");
    const handler = (e: PopStateEvent) => {
      onClose();
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [onClose]);

  const handleLikeChange = useCallback((postId: string, liked: boolean) => {
    setLikedPostIds((prev) => {
      const next = new Set(prev);
      if (liked) next.add(postId);
      else next.delete(postId);
      return next;
    });
    // Update counter so the displayed likes_count stays in sync
    setCounterOverrides((prev) => ({
      ...prev,
      [postId]: (prev[postId] ?? 0) + (liked ? 1 : -1),
    }));
  }, []);

  const authorData = useMemo(
    () => ({
      name: profile.display_name || "Пользователь",
      username: profile.username || profile.display_name || "user",
      avatar: profile.avatar_url || "",
      verified: profile.verified,
    }),
    [profile.display_name, profile.username, profile.avatar_url, profile.verified],
  );

  return (
    <motion.div
      className="fixed inset-0 z-40 bg-background flex flex-col"
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
    >
      {/* Sticky header */}
      <div className="sticky top-0 z-50 flex items-center gap-3 px-4 py-3 border-b border-border bg-background safe-area-top">
        <button onClick={onClose} className="p-1">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="font-semibold text-lg">Публикации</h1>
      </div>

      {/* Scrollable feed */}
      <div ref={containerRef} className="flex-1 overflow-y-auto overscroll-contain pb-24">
        {posts.map((post) => {
          const media = [...(post.post_media || [])]
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .filter((m) => m.media_url);

          return (
            <div
              key={post.id}
              ref={(el) => {
                postRefs.current[post.id] = el;
              }}
            >
              <PostCard
                id={post.id}
                authorId={post.author_id}
                author={authorData}
                content={post.content || ""}
                mediaItems={media.map((m) => ({
                  url: m.media_url!,
                  type: m.media_type,
                }))}
                likes={Math.max(0, (Number(post.likes_count) || 0) + (counterOverrides[post.id] ?? 0))}
                comments={Math.max(0, Number(post.comments_count) || 0)}
                shares={Math.max(0, Number(post.shares_count) || 0)}
                saves={Math.max(0, Number((post as Record<string, unknown>).saves_count ?? 0))}
                timeAgo={formatTimeAgo(post.created_at)}
                isLiked={likedPostIds.has(post.id)}
                onLikeChange={handleLikeChange}
                pinPosition={pinnedPostIds.has(post.id) ? 1 : null}
                onPinChanged={onPinChanged}
                hideLikes={(post as Record<string, unknown>).hide_likes_count === true}
                commentsDisabled={(post as Record<string, unknown>).comments_disabled === true}
              />
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
