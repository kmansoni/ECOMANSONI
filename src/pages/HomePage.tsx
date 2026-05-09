import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { FeedHeader } from "@/components/feed/FeedHeader";
import { ContentFilter } from "@/components/feed/FeedFilters";
import { PostCard } from "@/components/feed/PostCard";
import { PostCardSkeleton } from "@/components/feed/PostCardSkeleton";
import { PullToRefresh } from "@/components/feed/PullToRefresh";
import { SuggestedUsers } from "@/components/recommendations/SuggestedUsers";
import { useSmartFeed } from "@/hooks/useSmartFeed";
import { usePinnedPosts } from "@/hooks/usePinnedPosts";
import { usePresence } from "@/hooks/usePresence";
import { toast } from "sonner";
import { AlertCircle, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { FeedBrandPanel } from "@/components/feed/FeedBrandPanel";
import { PremiumFeedToggle } from "@/components/feed/PremiumFeedToggle";
import { FeedLayout, FeedTransition } from "@/components/feed/FeedLayout";
import { CreatePostFAB } from "@/components/feed/CreatePostFAB";
import { useTheme, useThemeTokens } from "@/pages/auth/theme";
import { SidebarWidgetContainer } from "@/components/sidebar/SidebarWidgetContainer";
import { useIsMobile } from "@/hooks/use-mobile";

export function HomePage() {
  const { posts, setPosts, loading, loadingMore, hasMore, mode, setMode, refetch, loadMore, error } = useSmartFeed();
  const { pinnedPositions, refresh: refreshPinnedPosts } = usePinnedPosts();
  const [contentFilter, setContentFilter] = useState<ContentFilter>("all");
  const [showScrollTop, setShowScrollTop] = useState(false);

  usePresence();
  const themeCtx = useTheme("dark");
  const tokens = useThemeTokens(themeCtx.theme);
  const isMobile = useIsMobile();

  const handleLikeChange = useCallback(
    (postId: string, liked: boolean) => {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, is_liked: liked, likes_count: liked ? p.likes_count + 1 : Math.max(0, p.likes_count - 1) }
            : p
        )
      );
    },
    [setPosts]
  );

  const handleRefresh = async () => {
    await refetch();
    toast.success("Лента обновлена!", { duration: 2000, position: "top-center" });
  };

  const filteredPosts = useMemo(() => {
    const sortByPinned = (items: typeof posts) => {
      if (pinnedPositions.size === 0) return items;
      const pinned: typeof posts = [];
      const regular: typeof posts = [];
      for (const post of items) {
        pinnedPositions.has(post.id) ? pinned.push(post) : regular.push(post);
      }
      pinned.sort((a, b) => (pinnedPositions.get(a.id) ?? 0) - (pinnedPositions.get(b.id) ?? 0));
      return [...pinned, ...regular];
    };
    if (contentFilter === "media") return sortByPinned(posts.filter((p) => (p.media?.length ?? 0) > 0));
    if (contentFilter === "text") return sortByPinned(posts.filter((p) => (p.media?.length ?? 0) === 0));
    return sortByPinned(posts);
  }, [posts, contentFilter, pinnedPositions]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) loadMore();
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  useEffect(() => {
    const h = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  const feedBorder = tokens.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const feedBg = tokens.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const skelBg = tokens.isDark ? "bg-white/10" : "bg-white/15";

  return (
    <div className="flex h-full">
      {/* Виджет-панель — только десктоп */}
      {!isMobile && (
        <aside className="hidden lg:flex w-[280px] xl:w-[300px] flex-shrink-0 flex-col overflow-y-auto border-r border-white/[0.06] bg-[linear-gradient(180deg,rgba(10,14,31,0.6),rgba(6,9,20,0.4))] backdrop-blur-xl scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {/* Brand header */}
          <div className="px-4 pt-5 pb-4 border-b border-white/[0.06]">
            <h2 className="text-lg font-bold text-white tracking-tight">Ваша лента</h2>
            <p className="text-xs text-white/50 mt-0.5">Публикации и рекомендации</p>
            <div className="grid grid-cols-3 gap-1.5 mt-3">
              {[
                { label: "Подписки", value: "142" },
                { label: "Публикации", value: "2.4K" },
                { label: "Советы", value: "38" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-2 text-center">
                  <div className="text-sm font-bold text-white">{s.value}</div>
                  <div className="text-[9px] uppercase tracking-wider text-white/40 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Виджеты */}
          <SidebarWidgetContainer />
        </aside>
      )}

      <div className="flex-1 min-w-0 overflow-y-auto">
    <PullToRefresh onRefresh={handleRefresh}>
      <FeedLayout tokens={tokens}>
        <div className="relative min-h-screen feed-column overflow-hidden bg-transparent">
          <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-transparent via-background/30 to-background/60" />
          <div className="aurora-overlay" />

          <div className="relative z-10">
            <FeedHeader />

            <div className="sticky top-0 z-20 flex justify-center border-b border-white/[0.06] bg-white/[0.02] px-4 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.12)] backdrop-blur-2xl supports-[backdrop-filter]:bg-white/[0.01]">
              <PremiumFeedToggle mode={mode} onChange={setMode} tokens={tokens} />
            </div>

            <FeedFiltersContent filter={contentFilter} onFilterChange={setContentFilter} tokens={tokens} />

            <div className="relative max-w-[540px] mx-auto px-0 sm:px-4 pb-24">
              {loading && posts.length === 0 ? (
                <div className="space-y-0">
                  {[0, 1, 2, 3].map((i) => (
                    <FeedTransition key={i}>
                      <div className="rounded-2xl overflow-hidden mb-4" style={{ background: feedBg, border: `1px solid ${feedBorder}` }}>
                        <PostCardSkeleton />
                      </div>
                    </FeedTransition>
                  ))}
                </div>
              ) : error && posts.length === 0 ? (
                <FeedTransition>
                  <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                    <div className="rounded-2xl p-6 border backdrop-blur-xl" style={{ background: feedBg, borderColor: feedBorder }}>
                      <AlertCircle className="h-7 w-7 mb-3" style={{ color: tokens.isDark ? "#00b4d8" : "#0096c7" }} />
                      <p className="text-base" style={{ color: tokens.textPrimary }}>Не удалось загрузить ленту</p>
                      <p className="text-sm mt-1" style={{ color: tokens.textMuted }}>{error}</p>
                      <button onClick={handleRefresh} className="mt-4 px-6 py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: "linear-gradient(135deg,#0096c7,#00c896)", boxShadow: "0 4px 16px rgba(0,180,216,0.25)" }}>
                        Повторить
                      </button>
                    </div>
                  </div>
                </FeedTransition>
              ) : filteredPosts.length === 0 ? (
                <FeedTransition>
                  <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                    <div className="rounded-2xl p-6 border backdrop-blur-xl" style={{ background: feedBg, borderColor: feedBorder }}>
                      <p className="text-lg font-medium" style={{ color: tokens.textPrimary }}>
                        {contentFilter === "all" ? "Пока нет публикаций" : contentFilter === "media" ? "Нет публикаций с медиа" : "Нет текстовых публикаций"}
                      </p>
                      <p className="text-sm mt-1" style={{ color: tokens.textMuted }}>Подпишитесь на авторов, чтобы видеть контент</p>
                    </div>
                  </div>
                </FeedTransition>
              ) : (
                <AnimatePresence mode="popLayout">
                  {filteredPosts.map((post, i) => {
                    const sid = typeof post.id === "string" && post.id.trim().length > 0 ? post.id : `post-gen-${i}`;
                    const sa = typeof post.author_id === "string" && post.author_id.trim().length > 0 ? post.author_id : "unknown";
                    const sn = post.author?.display_name || sa.slice(0, 8);
                    return (
                      <FeedTransition key={sid}>
                        <div className="rounded-2xl overflow-hidden mb-4" style={{ background: feedBg, border: `1px solid ${feedBorder}` }}>
                          {i === 2 && <SuggestedUsers className="py-2 border-y" />}
                          <PostCard
                            id={sid}
                            authorId={sa}
                            author={{ name: post.author?.display_name || "Пользователь", username: sn, avatar: post.author?.avatar_url || "", verified: post.author?.is_verified ?? false }}
                            content={post.content || ""}
                            mediaItems={post.media?.map((m) => ({ url: m.media_url, type: m.media_type }))}
                            likes={post.likes_count}
                            comments={post.comments_count}
                            shares={post.shares_count}
                            saves={post.saves_count}
                            timeAgo={post.created_at}
                            isLiked={post.is_liked}
                            onLikeChange={handleLikeChange}
                            hideLikes={post.hide_likes_count}
                            commentsDisabled={post.comments_disabled}
                          />
                        </div>
                      </FeedTransition>
                    );
                  })}
                </AnimatePresence>
              )}

              <div ref={sentinelRef} className="h-4" />

              {loadingMore && (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" style={{ color: tokens.isDark ? "#00b4d8" : "#0096c7" }} />
                  <span className="ml-2 text-sm" style={{ color: tokens.textMuted }}>Загрузка...</span>
                </div>
              )}

              {!hasMore && filteredPosts.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8">
                  <p className="text-sm" style={{ color: tokens.textMuted }}>Вы посмотрели все публикации</p>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </FeedLayout>

      {mode === "following" && <CreatePostFAB tokens={tokens} />}

      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={scrollToTop}
            whileTap={{ scale: 0.9 }}
            className="fixed bottom-20 right-6 z-50 w-10 h-10 rounded-full border backdrop-blur-xl flex items-center justify-center"
            style={{ background: tokens.isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.8)", borderColor: tokens.isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}
            aria-label="Наверх"
          >
            <span className="w-4 h-4" style={{ borderTop: `2px solid ${tokens.isDark ? "white" : "#334155"}`, borderLeft: `2px solid ${tokens.isDark ? "white" : "#334155"}`, transform: "rotate(45deg)", display: "block" }} />
          </motion.button>
        )}
      </AnimatePresence>
    </PullToRefresh>
      </div>
    </div>
  );
}

function FeedFiltersContent({ filter, onFilterChange, tokens }: { filter: ContentFilter; onFilterChange: (f: ContentFilter) => void; tokens: any }) {
  const filters: { id: ContentFilter; label: string }[] = [
    { id: "all", label: "Все" },
    { id: "media", label: "Публикации" },
    { id: "text", label: "Текст" },
  ];
  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide px-3 py-1.5">
      {filters.map((f) => (
        <button
          key={f.id}
          onClick={() => onFilterChange(f.id)}
          className={`relative px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${filter === f.id ? "text-white" : "text-white/50 hover:text-white/80"}`}
          style={
            filter === f.id
              ? { background: "linear-gradient(135deg, rgba(0,180,216,0.25), rgba(0,200,150,0.2))", boxShadow: "0 2px 12px rgba(0,180,216,0.15)" }
              : {}
          }
        >
          {f.label}
        </button>
      ))}
      {filter !== "all" && (
        <button onClick={() => onFilterChange("all")} className="ml-auto p-1.5 rounded-full text-white/30 hover:text-white/60 transition-colors" aria-label="Сбросить фильтр">
          <XIcon />
        </button>
      )}
    </div>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}