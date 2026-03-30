import { useState, useMemo, useEffect, useRef } from "react";
import { FeedHeader } from "@/components/feed/FeedHeader";
import { FeedFilters, ContentFilter } from "@/components/feed/FeedFilters";
import { PostCard } from "@/components/feed/PostCard";
import { PostCardSkeleton } from "@/components/feed/PostCardSkeleton";
import { PullToRefresh } from "@/components/feed/PullToRefresh";
import { SmartFeedToggle } from "@/components/feed/SmartFeedToggle";
import { useSmartFeed } from "@/hooks/useSmartFeed";
import { usePinnedPosts } from "@/hooks/usePinnedPosts";
import { usePresence } from "@/hooks/usePresence";
import { toast } from "sonner";
import { AlertCircle, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

export function HomePage() {
  const { posts, loading, loadingMore, hasMore, mode, setMode, refetch, loadMore, error } = useSmartFeed();
  const { pinnedPositions, refresh: refreshPinnedPosts } = usePinnedPosts();
  const [contentFilter, setContentFilter] = useState<ContentFilter>('all');

  // Initialize presence tracking
  usePresence();

  const handleRefresh = async () => {
    await refetch();
    toast.success("Лента обновлена!", {
      duration: 2000,
      position: "top-center",
    });
  };

  const formatTimeAgo = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: false, locale: ru });
    } catch (_err) {
      return "";
    }
  };

  // Client-side filtering based on content type
  const filteredPosts = useMemo(() => {
    const sortByPinned = (items: typeof posts) => {
      if (pinnedPositions.size === 0) return items;

      const pinned: typeof posts = [];
      const regular: typeof posts = [];

      for (const post of items) {
        if (pinnedPositions.has(post.id)) {
          pinned.push(post);
        } else {
          regular.push(post);
        }
      }

      pinned.sort((a, b) => (pinnedPositions.get(a.id) ?? 0) - (pinnedPositions.get(b.id) ?? 0));
      return [...pinned, ...regular];
    };

    if (contentFilter === 'media') {
      return sortByPinned(posts.filter(p => (p.media?.length ?? 0) > 0));
    }
    if (contentFilter === 'text') {
      return sortByPinned(posts.filter(p => (p.media?.length ?? 0) === 0));
    }
    return sortByPinned(posts);
  }, [posts, contentFilter, pinnedPositions]);

  // Infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingMore) {
        loadMore();
      }
    }, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="min-h-screen">
        <FeedHeader />

        {/* Smart Feed Toggle */}
        <div className="flex justify-center px-4 py-2 sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-white/5">
          <SmartFeedToggle mode={mode} onChange={setMode} />
        </div>

        <FeedFilters
          filter={contentFilter}
          onFilterChange={setContentFilter}
        />

        {loading && posts.length === 0 ? (
          // ИСПРАВЛЕНИЕ: skeleton-экраны вместо spinner — соответствует поведению Instagram
          <div className="space-y-0">
            {Array.from({ length: 3 }).map((_, i) => (
              <PostCardSkeleton key={i} />
            ))}
          </div>
        ) : error && posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <AlertCircle className="h-7 w-7 text-destructive mb-3" />
            <p className="text-foreground text-base">Не удалось загрузить ленту</p>
            <p className="text-muted-foreground text-sm mt-1">{error}</p>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <p className="text-muted-foreground text-lg">
              {contentFilter === 'all'
                ? "Пока нет публикаций"
                : contentFilter === 'media'
                  ? "Нет публикаций с медиа"
                  : "Нет текстовых публикаций"}
            </p>
            <p className="text-muted-foreground/70 text-sm mt-1">
              {contentFilter === 'all'
                ? "Создайте первую запись или подпишитесь на авторов"
                : "Попробуйте другой фильтр"}
            </p>
          </div>
        ) : (
          <div className="space-y-0">
            {filteredPosts.map((post, index) => {
              const safePostId = typeof post.id === "string" && post.id.trim().length > 0
                ? post.id
                : `post-fallback-${String(post.id || 'unknown').slice(0, 8)}-${index}`;
              const safeAuthorId = typeof post.author_id === "string" && post.author_id.trim().length > 0
                ? post.author_id
                : "unknown-author";
              const safeUsername = post.author?.display_name || safeAuthorId.slice(0, 8);

              return (
                <PostCard
                  key={safePostId}
                  id={safePostId}
                  authorId={safeAuthorId}
                  author={{
                      name: post.author?.display_name || "Пользователь",
                      username: safeUsername,
                      // ИСПРАВЛЕНИЕ дефекта #1: убран pravatar.cc — утечка user ID на сторонний сервис
                      // AvatarFallback в PostCard обрабатывает пустой src через initials
                      avatar: post.author?.avatar_url || '',
                      // ИСПРАВЛЕНИЕ дефекта #2: verified берётся из данных автора, не захардкожен
                      verified: post.author?.is_verified ?? false,
                    }}
                  content={post.content || ""}
                  images={post.media?.map(m => m.media_url)}
                  mediaItems={post.media?.map((m) => ({ url: m.media_url, type: m.media_type }))}
                  likes={post.likes_count}
                  comments={post.comments_count}
                  shares={post.shares_count}
                  saves={post.saves_count}
                  timeAgo={formatTimeAgo(post.created_at)}
                  isLiked={post.is_liked}
                  pinPosition={pinnedPositions.get(post.id) ?? null}
                  onPinChanged={() => {
                    void refreshPinnedPosts();
                  }}
                />
              );
            })}

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-4" />

            {loadingMore && (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {!hasMore && filteredPosts.length > 0 && (
              <p className="text-center text-zinc-600 text-sm py-6">
                Вы посмотрели все публикации
              </p>
            )}
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
