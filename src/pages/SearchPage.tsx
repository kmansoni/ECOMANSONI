import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Play, Hash, User, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSearch } from "@/hooks/useSearch";
import { VerifiedBadge } from "@/components/ui/verified-badge";

const trends = [
  { tag: "новости", posts: "12.5K" },
  { tag: "технологии", posts: "8.2K" },
  { tag: "путешествия", posts: "5.1K" },
  { tag: "еда", posts: "15.3K" },
  { tag: "мода", posts: "9.7K" },
  { tag: "спорт", posts: "6.8K" },
];

export function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"explore" | "users">("explore");
  const { users, explorePosts, loading, exploring, searchUsers, fetchExplorePosts, toggleFollow } = useSearch();

  useEffect(() => {
    fetchExplorePosts();
  }, [fetchExplorePosts]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim()) {
        setSearchMode("users");
        searchUsers(query);
      } else {
        setSearchMode("explore");
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, searchUsers]);

  const handleUserClick = (userId: string) => {
    navigate(`/user/${userId}`);
  };

  const handlePostClick = (index: number) => {
    navigate(`/explore/${index}`);
  };

  return (
    <div className="min-h-screen pb-20">
      {/* Search Bar */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3 safe-area-top">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Поиск пользователей..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 pr-4 h-11 rounded-xl bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-primary"
          />
        </div>
      </div>

      {searchMode === "users" && query.trim() ? (
        // User Search Results
        <div className="px-4 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : users.length > 0 ? (
            <div className="space-y-2">
              {users.map((user) => (
                <div
                  key={user.user_id}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 active:bg-muted transition-colors cursor-pointer"
                  onClick={() => handleUserClick(user.user_id)}
                  onTouchEnd={(e) => {
                    // Prevent issues with touch events in Telegram Mini App
                    const target = e.target as HTMLElement;
                    // Don't navigate if clicking on button or verified badge
                    if (target.closest('button')) return;
                    handleUserClick(user.user_id);
                  }}
                >
                  <Avatar className="w-12 h-12 pointer-events-none">
                    <AvatarImage src={user.avatar_url || undefined} />
                    <AvatarFallback className="bg-muted">
                      <User className="w-5 h-5 text-muted-foreground" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 pointer-events-none">
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-foreground truncate">
                        {user.display_name}
                      </span>
                      {user.verified && (
                        <span className="pointer-events-auto">
                          <VerifiedBadge size="sm" />
                        </span>
                      )}
                    </div>
                    {user.bio && (
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {user.bio}
                      </p>
                    )}
                  </div>
                  <Button
                    variant={user.isFollowing ? "outline" : "default"}
                    size="sm"
                    className="rounded-full shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFollow(user.user_id);
                    }}
                  >
                    {user.isFollowing ? "Отписаться" : "Подписаться"}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <User className="w-12 h-12 mb-2 opacity-20" />
              <p>Пользователи не найдены</p>
            </div>
          )}
        </div>
      ) : (
        // Explore Mode
        <>
          {/* Trending Hashtags */}
          <div className="px-4 py-3">
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex gap-2">
                {trends.map((trend) => (
                  <button
                    key={trend.tag}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-muted hover:bg-muted/80 transition-colors"
                  >
                    <Hash className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{trend.tag}</span>
                    <span className="text-xs text-muted-foreground">{trend.posts}</span>
                  </button>
                ))}
              </div>
              <ScrollBar orientation="horizontal" className="h-0" />
            </ScrollArea>
          </div>

          {/* Explore Grid */}
          <div className="px-1">
            {exploring ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : explorePosts.length > 0 ? (
              <div className="grid grid-cols-3 gap-[2px]">
                {explorePosts.map((post, index) => {
                  const isVideo = post.media?.[0]?.media_type === "video";
                  return (
                    <div
                      key={post.id}
                      className="aspect-square relative group cursor-pointer overflow-hidden bg-muted"
                      onClick={() => handlePostClick(index)}
                    >
                      <img
                        src={post.media?.[0]?.media_url}
                        alt=""
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                      {isVideo && (
                        <div className="absolute top-2 right-2">
                          <div className="w-6 h-6 rounded-full bg-black/60 flex items-center justify-center">
                            <Play className="w-3 h-3 text-white fill-white ml-0.5" />
                          </div>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Search className="w-12 h-12 mb-2 opacity-20" />
                <p>Нет публикаций для просмотра</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
