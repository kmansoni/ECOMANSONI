import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useSearch } from "@/hooks/useSearch";
import { PostCard } from "@/components/feed/PostCard";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

export function ExploreFeedPage() {
  const navigate = useNavigate();
  const { postIndex } = useParams();
  const { explorePosts, exploring, fetchExplorePosts } = useSearch();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);

  // Fetch posts on mount
  useEffect(() => {
    fetchExplorePosts();
  }, [fetchExplorePosts]);

  // Scroll to selected post once posts are loaded
  useEffect(() => {
    if (explorePosts.length > 0 && postIndex && !hasScrolled.current) {
      const index = parseInt(postIndex, 10);
      if (!isNaN(index) && index >= 0 && index < explorePosts.length) {
        // Small delay to ensure elements are rendered
        setTimeout(() => {
          const element = document.getElementById(`explore-post-${index}`);
          if (element) {
            element.scrollIntoView({ behavior: "instant", block: "start" });
            hasScrolled.current = true;
          }
        }, 50);
      }
    }
  }, [explorePosts, postIndex]);

  const formatTimeAgo = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ru });
    } catch {
      return "";
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20" ref={scrollContainerRef}>
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border safe-area-top">
        <div className="flex items-center h-12 px-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center w-10 h-10 -ml-2 rounded-full hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="font-semibold text-lg ml-2">Публикации</h1>
        </div>
      </header>

      {/* Posts Feed */}
      {exploring ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : explorePosts.length > 0 ? (
        <div>
          {explorePosts.map((post, index) => (
            <div key={post.id} id={`explore-post-${index}`}>
              <PostCard
                id={post.id}
                authorId={post.author_id}
                author={{
                  name: post.profile?.display_name || "Пользователь",
                  username: post.profile?.display_name || "user",
                  avatar: post.profile?.avatar_url || "",
                  verified: post.profile?.verified,
                }}
                content={post.content || ""}
                images={post.media?.map((m) => m.media_url)}
                likes={post.likes_count}
                comments={post.comments_count}
                shares={post.shares_count}
                
                timeAgo={formatTimeAgo(post.created_at)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <p>Нет публикаций</p>
        </div>
      )}
    </div>
  );
}
