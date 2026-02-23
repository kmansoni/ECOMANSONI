import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Play, Hash, User, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { normalizeReelMediaUrl } from "@/hooks/useReels";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSearch } from "@/hooks/useSearch";
import { VerifiedBadge } from "@/components/ui/verified-badge";

function formatCompactCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.max(0, Math.floor(value)));
}

export function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"explore" | "users">("explore");
  const {
    users,
    explorePosts,
    trendingHashtags,
    trendingLoading,
    explorePage,
    explorePageLoading,
    loading,
    exploring,
    searchUsers,
    fetchExplorePosts,
    fetchTrendingHashtags,
    fetchExplorePage,
    toggleFollow,
  } = useSearch();

  useEffect(() => {
    fetchExplorePosts();
  }, [fetchExplorePosts]);

  useEffect(() => {
    fetchTrendingHashtags();
  }, [fetchTrendingHashtags]);

  useEffect(() => {
    fetchExplorePage();
  }, [fetchExplorePage]);

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

  const handleHashtagClick = (normalizedTag: string) => {
    const clean = String(normalizedTag || "").trim();
    if (!clean) return;
    navigate(`/hashtag/${encodeURIComponent(clean)}`);
  };

  const recommendedReels = (() => {
    const sections = explorePage?.sections || [];
    const s = sections.find((x) => x.type === "recommended_reels");
    const items = (s?.items || []) as any[];
    return items;
  })();

  const popularHashtags = (() => {
    const sections = explorePage?.sections || [];
    const s = sections.find((x) => x.type === "hashtags");
    const items = (s?.items || []) as any[];
    return items;
  })();

  const freshCreators = (() => {
    const sections = explorePage?.sections || [];
    const s = sections.find((x) => x.type === "fresh_creators");
    const items = (s?.items || []) as any[];
    return items;
  })();

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
                {trendingLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground px-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Загружаем тренды…</span>
                  </div>
                ) : trendingHashtags.length > 0 ? (
                  trendingHashtags.map((trend) => {
                    const tag = trend.normalized_tag;
                    const count = Number(trend.usage_last_24h ?? 0);
                    return (
                      <button
                        key={tag}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-muted hover:bg-muted/80 transition-colors"
                        onClick={() => handleHashtagClick(tag)}
                        aria-label={`Открыть #${tag}`}
                      >
                        <Hash className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{tag}</span>
                        <span className="text-xs text-muted-foreground">{formatCompactCount(count)}</span>
                      </button>
                    );
                  })
                ) : (
                  <div className="text-sm text-muted-foreground px-2">Трендов пока нет</div>
                )}
              </div>
              <ScrollBar orientation="horizontal" className="h-0" />
            </ScrollArea>
          </div>

          {/* Explore Sections (server-driven, additive) */}
          <div className="px-4 pb-2">
            {explorePageLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Обновляем подборку…</span>
              </div>
            ) : null}

            {!explorePageLoading && recommendedReels.length > 0 ? (
              <div className="mt-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Reels для вас</div>
                  <button
                    type="button"
                    className="text-sm font-semibold text-primary"
                    onClick={() => navigate("/reels")}
                  >
                    Открыть
                  </button>
                </div>
                <ScrollArea className="w-full whitespace-nowrap mt-2">
                  <div className="flex gap-2">
                    {recommendedReels.slice(0, 12).map((r: any) => (
                      <button
                        key={String(r?.reel_id ?? "")}
                        type="button"
                        className="w-24 h-32 rounded-xl overflow-hidden bg-muted flex-shrink-0"
                        onClick={() => navigate("/reels")}
                        aria-label="Открыть Reels"
                      >
                        {r?.thumbnail_url ? (
                          <img
                            src={
                              normalizeReelMediaUrl(r.thumbnail_url, "reels-media") ||
                              String(r.thumbnail_url)
                            }
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            <Play className="w-5 h-5" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                  <ScrollBar orientation="horizontal" className="h-0" />
                </ScrollArea>
              </div>
            ) : null}

            {!explorePageLoading && popularHashtags.length > 0 ? (
              <div className="mt-4">
                <div className="text-sm font-medium mb-2">Популярные хештеги</div>
                <ScrollArea className="w-full whitespace-nowrap">
                  <div className="flex gap-2">
                    {popularHashtags.slice(0, 16).map((h: any) => (
                      <button
                        key={String(h?.hashtag ?? "")}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-muted hover:bg-muted/80 transition-colors"
                        onClick={() => handleHashtagClick(String(h?.hashtag ?? ""))}
                        aria-label={`Открыть #${String(h?.hashtag ?? "")}`}
                      >
                        <Hash className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{String(h?.hashtag ?? "")}</span>
                        {typeof h?.post_count_approx === "number" ? (
                          <span className="text-xs text-muted-foreground">
                            {formatCompactCount(Number(h.post_count_approx))}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                  <ScrollBar orientation="horizontal" className="h-0" />
                </ScrollArea>
              </div>
            ) : null}

            {!explorePageLoading && freshCreators.length > 0 ? (
              <div className="mt-4">
                <div className="text-sm font-medium mb-2">Новые авторы</div>
                <ScrollArea className="w-full whitespace-nowrap">
                  <div className="flex gap-3">
                    {freshCreators.slice(0, 14).map((c: any) => {
                      const userId = String(c?.user_id ?? "");
                      const name = String(c?.display_name ?? "Пользователь");
                      const avatarUrl = c?.avatar_url ? String(c.avatar_url) : "";
                      return (
                        <button
                          key={userId || name}
                          type="button"
                          className="flex flex-col items-center gap-1 w-20"
                          onClick={() => {
                            if (!userId) return;
                            navigate(`/user/${encodeURIComponent(userId)}`);
                          }}
                          aria-label={`Открыть профиль ${name}`}
                        >
                          <Avatar className="w-14 h-14">
                            <AvatarImage src={avatarUrl || undefined} />
                            <AvatarFallback className="bg-muted">
                              <User className="w-5 h-5 text-muted-foreground" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="text-xs text-foreground truncate w-full text-center">
                            {name}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <ScrollBar orientation="horizontal" className="h-0" />
                </ScrollArea>
              </div>
            ) : null}
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
