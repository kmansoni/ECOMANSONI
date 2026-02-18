import { useState, useMemo } from "react";
import { FeedHeader } from "@/components/feed/FeedHeader";
import { FeedFilters, ContentFilter } from "@/components/feed/FeedFilters";
import { PostCard } from "@/components/feed/PostCard";
import { PullToRefresh } from "@/components/feed/PullToRefresh";
import { usePosts } from "@/hooks/usePosts";
import { usePresence } from "@/hooks/usePresence";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

export function HomePage() {
  const { posts, loading, refetch } = usePosts();
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
    } catch {
      return "";
    }
  };

  // Client-side filtering based on content type
  const filteredPosts = useMemo(() => {
    if (contentFilter === 'media') {
      return posts.filter(p => (p.media?.length ?? 0) > 0);
    }
    if (contentFilter === 'text') {
      return posts.filter(p => (p.media?.length ?? 0) === 0);
    }
    return posts;
  }, [posts, contentFilter]);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="min-h-screen">
        <FeedHeader />
        
        <FeedFilters 
          filter={contentFilter} 
          onFilterChange={setContentFilter} 
        />
        
        {loading && posts.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
            {filteredPosts.map((post) => (
              <PostCard
                key={post.id}
                id={post.id}
                authorId={post.author_id}
                author={{
                  name: post.author?.display_name || "Пользователь",
                  username: post.author?.display_name || post.author_id.slice(0, 8),
                  avatar: post.author?.avatar_url || `https://i.pravatar.cc/150?u=${post.author_id}`,
                  verified: false,
                }}
                content={post.content || ""}
                images={post.media?.map(m => m.media_url)}
                likes={post.likes_count}
                comments={post.comments_count}
                shares={post.shares_count}
                
                timeAgo={formatTimeAgo(post.created_at)}
                isLiked={post.is_liked}
              />
            ))}
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
