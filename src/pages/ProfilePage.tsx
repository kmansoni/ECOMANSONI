import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings, Grid3X3, Bookmark, Play, Plus, User,
  Loader2, AtSign, TrendingUp, Link, ChevronDown, MoreHorizontal, QrCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { CreateContentModal } from "@/components/feed/CreateContentModal";
import { FollowersSheet } from "@/components/profile/FollowersSheet";
import { EditProfileSheet } from "@/components/profile/EditProfileSheet";
import { HighlightCircle } from "@/components/profile/HighlightCircle";
import { CreateHighlightSheet } from "@/components/profile/CreateHighlightSheet";
import { ProfileGrid } from "@/components/profile/ProfileGrid";
import { ProfileMenu } from "@/components/profile/ProfileMenu";
import { BusinessActionButtons } from "@/components/profile/BusinessActionButtons";
import { TaggedPostsGrid } from "@/components/profile/TaggedPostsGrid";
import { SavedCollections } from "@/components/profile/SavedCollections";
import { ProfileQRCode } from "@/components/profile/ProfileQRCode";
import { PinnedPosts } from "@/components/profile/PinnedPosts";
import { useProfile, useUserPosts } from "@/hooks/useProfile";
import { usePinnedPosts } from "@/hooks/usePinnedPosts";
import { getHighlights, deleteHighlight, blockUser, Highlight } from "@/hooks/useProfile";
import { useSavedPosts } from "@/hooks/useSavedPosts";
import { useAuth } from "@/hooks/useAuth";
import { normalizeReelMediaUrl } from "@/lib/reels/media";
import { dbLoose } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { ContentType } from "@/hooks/useMediaEditor";
import { toast } from "sonner";
import { buildProfileUrl } from "@/lib/users/profileLinks";
import { logger } from "@/lib/logger";

type PostMediaItem = {
  media_url?: string | null;
};

type ReelRpcRow = {
  id?: string | number;
  video_url?: string | null;
  thumbnail_url?: string | null;
  views_count?: string | number | null;
  likes_count?: string | number | null;
  created_at?: string | null;
};

type ProfileMetaExtras = {
  status_emoji?: string | null;
  category?: string | null;
  account_type?: string | null;
  action_email?: string | null;
  action_phone?: string | null;
  action_address?: string | null;
};

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function formatBioForDisplay(rawBio: string): string {
  return rawBio
    .split(/\r?\n/)
    .map((line) => line.replace(/^(\s*\d+)\.(\S)/, "$1. $2"))
    .join("\n")
    .trim();
}

const TABS = [
  { id: "posts", icon: Grid3X3, label: "Публикации" },
  { id: "reels", icon: Play, label: "Reels" },
  { id: "tagged", icon: AtSign, label: "Отмеченные" },
] as const;

type TabId = (typeof TABS)[number]["id"] | "saved";

export function ProfilePage() {
  const navigate = useNavigate();
  const { userId: paramUserId } = useParams<{ userId?: string }>();
  const { user } = useAuth();

  // Determine which profile to show
  const targetUserId = paramUserId || user?.id;
  const isOwnProfile = !paramUserId || paramUserId === user?.id;

  const { profile, loading: profileLoading, follow, unfollow, updateProfile, refetch } = useProfile(targetUserId);
  const { posts, loading: postsLoading } = useUserPosts(targetUserId);
  const { pinnedPosts, refresh: refreshPinnedPosts } = usePinnedPosts(targetUserId);
  const { savedPosts, fetchSavedPosts, loading: savedLoading } = useSavedPosts();

  // ИСПРАВЛЕНИЕ дефекта #16: оптимистичное состояние follow/unfollow
  // Обновляем UI мгновенно, откатываем при ошибке
  const [optimisticFollowing, setOptimisticFollowing] = useState<boolean | null>(null);
  const [optimisticFollowersCount, setOptimisticFollowersCount] = useState<number | null>(null);
  const [followPending, setFollowPending] = useState(false);

  // Вычисляемые значения с учётом оптимистичного состояния
  const displayIsFollowing = optimisticFollowing ?? profile?.isFollowing ?? false;
  const displayFollowersCount = optimisticFollowersCount ?? profile?.stats?.followersCount ?? 0;

  useEffect(() => {
    const avatarUrl = profile?.avatar_url?.trim();
    // data: и blob: URI не нужно преднагружать — браузер выдаёт credentials mismatch warning
    if (!avatarUrl || avatarUrl.startsWith("data:") || avatarUrl.startsWith("blob:")) return;

    const preload = document.createElement("link");
    preload.rel = "preload";
    preload.as = "image";
    preload.href = avatarUrl;
    preload.crossOrigin = "anonymous";
    document.head.appendChild(preload);

    return () => {
      document.head.removeChild(preload);
    };
  }, [profile?.avatar_url]);

  const mediaPosts = useMemo(
    () =>
      posts.filter(
        (post) =>
          Array.isArray(post?.post_media) &&
          post.post_media.some((m: PostMediaItem) => typeof m?.media_url === "string" && m.media_url.trim().length > 0),
      ),
    [posts],
  );

  const pinnedPostIds = useMemo(
    () => new Set(pinnedPosts.map((post) => post.post_id)),
    [pinnedPosts],
  );

  const gridPosts = useMemo(
    () => mediaPosts.filter((post) => !pinnedPostIds.has(String(post.id))),
    [mediaPosts, pinnedPostIds],
  );

  const [activeTab, setActiveTab] = useState<TabId>("posts");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFollowers, setShowFollowers] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showCreateHighlight, setShowCreateHighlight] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [highlightsLoading, setHighlightsLoading] = useState(false);
  // ИСПРАВЛЕНИЕ дефекта #18: заменяем confirm() на AlertDialog
  const [highlightToDelete, setHighlightToDelete] = useState<string | null>(null);

  // Типизированный интерфейс для Reels профиля
  interface ProfileReel {
    id: string;
    video_url: string;
    thumbnail_url: string | null;
    views_count: number;
    likes_count: number;
    created_at: string;
  }

  const [myReels, setMyReels] = useState<ProfileReel[]>([]);
  const [myReelsLoading, setMyReelsLoading] = useState(false);
  const [myReelsHasMore, setMyReelsHasMore] = useState(true);
  // AbortController для отмены запроса при смене userId
  const reelsAbortRef = useRef<AbortController | null>(null);

  // Load highlights
  const loadHighlights = useCallback(async () => {
    if (!targetUserId) return;
    setHighlightsLoading(true);
    try {
      const data = await getHighlights(targetUserId);
      setHighlights(data);
    } catch (error) {
      logger.warn("profile.load_highlights_failed", { error, targetUserId });
    } finally {
      setHighlightsLoading(false);
    }
  }, [targetUserId]);

  useEffect(() => {
    loadHighlights();
  }, [loadHighlights]);

  // Load reels on tab switch
  // ИСПРАВЛЕНИЕ: AbortController предотвращает race condition при быстрой смене userId
  const loadMyReels = useCallback(async (opts?: { reset?: boolean }) => {
    if (!targetUserId) return;
    const reset = Boolean(opts?.reset);
    if (!reset && !myReelsHasMore) return;

    // Отменяем предыдущий запрос
    reelsAbortRef.current?.abort();
    const controller = new AbortController();
    reelsAbortRef.current = controller;

    setMyReelsLoading(true);
    try {
      const limit = 30;
      const offset = reset ? 0 : myReels.length;
      const { data, error } = await dbLoose.rpc("get_user_reels_v1", {
        p_author_id: targetUserId,
        p_limit: limit,
        p_offset: offset,
      });

      // Игнорируем ответ если userId сменился во время запроса
      if (controller.signal.aborted) return;
      if (error) throw error;

      const reelRows = Array.isArray(data) ? (data as unknown as ReelRpcRow[]) : [];
      const rows: ProfileReel[] = reelRows.map((r) => ({
        id: String(r.id ?? ""),
        video_url: normalizeReelMediaUrl(r.video_url ?? null, "reels-media"),
        thumbnail_url: normalizeReelMediaUrl(r.thumbnail_url ?? null, "reels-media") || r.thumbnail_url || null,
        views_count: Number(r.views_count ?? 0),
        likes_count: Number(r.likes_count ?? 0),
        created_at: String(r.created_at ?? ""),
      }));

      setMyReels(prev => (reset ? rows : [...prev, ...rows]));
      setMyReelsHasMore(rows.length >= limit);
    } catch (error) {
      if (isAbortError(error)) return;
      logger.warn("profile.load_my_reels_failed", { error, targetUserId, reset });
    } finally {
      if (!controller.signal.aborted) setMyReelsLoading(false);
    }
  }, [targetUserId, myReelsHasMore, myReels.length]);

  // ИСПРАВЛЕНИЕ: мемоизирован через useCallback — стабильная ссылка при ре-рендерах
  const handleTabChange = useCallback((tabId: TabId) => {
    setActiveTab(tabId);
    if (tabId === "saved") fetchSavedPosts();
    if (tabId === "reels") void loadMyReels({ reset: true });
  }, [fetchSavedPosts, loadMyReels]);

  useEffect(() => {
    setMyReels([]);
    setMyReelsHasMore(true);
    // Отменяем запрос при смене профиля
    reelsAbortRef.current?.abort();
  }, [targetUserId]);

  // Cleanup при unmount — отменяем все pending запросы
  useEffect(() => {
    return () => {
      reelsAbortRef.current?.abort();
    };
  }, []);

  const handleDeleteHighlight = async (id: string) => {
    try {
      await deleteHighlight(id);
      setHighlights(prev => prev.filter(h => h.id !== id));
      toast.success("Подборка удалена");
    } catch (error) {
      logger.error("profile.delete_highlight_failed", { error, highlightId: id });
      toast.error("Не удалось удалить подборку");
    }
  };

  const handleBlock = async () => {
    if (!user || !targetUserId) return;
    try {
      await blockUser(user.id, targetUserId);
      toast.success("Пользователь заблокирован");
      navigate(-1);
    } catch (error) {
      logger.error("profile.block_user_failed", { error, targetUserId, actorId: user.id });
      toast.error("Не удалось заблокировать");
    }
  };

  // ИСПРАВЛЕНИЕ дефекта #16: оптимистичный follow/unfollow
  const handleFollowToggle = async () => {
    if (followPending || !profile) return;

    const wasFollowing = displayIsFollowing;
    const prevCount = displayFollowersCount;

    // Мгновенное обновление UI
    setOptimisticFollowing(!wasFollowing);
    setOptimisticFollowersCount(wasFollowing ? Math.max(0, prevCount - 1) : prevCount + 1);
    setFollowPending(true);

    try {
      if (wasFollowing) {
        await unfollow();
      } else {
        await follow();
      }
      // Сбрасываем оптимистичное состояние — реальные данные придут через refetch
      await refetch();
      setOptimisticFollowing(null);
      setOptimisticFollowersCount(null);
    } catch (error) {
      // Откат при ошибке
      setOptimisticFollowing(wasFollowing);
      setOptimisticFollowersCount(prevCount);
      logger.error("profile.follow_toggle_failed", { error, targetUserId, isFollowing: wasFollowing });
      toast.error("Не удалось выполнить действие");
    } finally {
      setFollowPending(false);
    }
  };

  // ── Loading state ──────────────────────────────────────────────
  if (profileLoading) {
    // ИСПРАВЛЕНИЕ: skeleton вместо spinner — соответствует поведению Instagram
    return (
      <div className="min-h-screen bg-background">
        {/* Header skeleton */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
          <div className="h-5 w-32 rounded bg-muted animate-pulse" />
          <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
        </div>
        {/* Avatar + stats skeleton */}
        <div className="px-4 pt-2 pb-4">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-muted animate-pulse shrink-0" />
            <div className="flex-1 flex justify-around">
              {[0,1,2].map(i => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className="h-5 w-10 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-14 rounded bg-muted animate-pulse" />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-4 w-36 rounded bg-muted animate-pulse" />
            <div className="h-3 w-full rounded bg-muted animate-pulse" />
            <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
          </div>
          <div className="flex gap-2 mt-4">
            <div className="flex-1 h-9 rounded-xl bg-muted animate-pulse" />
            <div className="flex-1 h-9 rounded-xl bg-muted animate-pulse" />
          </div>
        </div>
        {/* Grid skeleton */}
        <div className="grid grid-cols-3 gap-0.5">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="aspect-square bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!user && !profile) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 gap-4">
        <User className="w-16 h-16 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Войдите в аккаунт</h2>
        <p className="text-muted-foreground text-center text-sm">Чтобы просматривать профиль</p>
        <Button onClick={() => navigate("/auth")}>Войти</Button>
      </div>
    );
  }

  const displayProfile = profile;
  const displayProfileMeta = displayProfile as (typeof displayProfile & ProfileMetaExtras) | null;

  const allTabs = isOwnProfile
    ? ([...TABS, { id: "saved" as const, icon: Bookmark, label: "Сохранённые" }])
    : TABS;

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pb-24">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-3 safe-area-top">
        <div className="flex items-center gap-1.5">
          {!isOwnProfile && (
            <button onClick={() => navigate(-1)} className="mr-2">
              <ChevronDown className="w-6 h-6 rotate-90" />
            </button>
          )}
          <h1 className="font-semibold text-lg text-foreground">
            {displayProfile?.display_name || "Профиль"}
          </h1>
          {displayProfile?.verified && <VerifiedBadge size="md" />}
        </div>
        <div className="flex items-center gap-2">
          {isOwnProfile && (
            <>
              <button
                onClick={() => navigate("/analytics")}
                className="w-10 h-10 rounded-full bg-card/80 border border-border flex items-center justify-center"
                aria-label="Аналитика"
              >
                <TrendingUp className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowQR(true)}
                className="w-10 h-10 rounded-full bg-card/80 border border-border flex items-center justify-center"
                aria-label="QR-код"
              >
                <QrCode className="w-5 h-5" />
              </button>
            </>
          )}
          <button
            onClick={() => setShowMenu(true)}
            className="w-10 h-10 rounded-full bg-card/80 border border-border flex items-center justify-center"
          >
            {isOwnProfile ? <Settings className="w-5 h-5" /> : <MoreHorizontal className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* ── Profile header ── */}
      <div className="px-4 pt-2 pb-4">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => isOwnProfile && setShowEditProfile(true)}
              className="relative block"
            >
              <div className="w-20 h-20 rounded-full ring-2 ring-offset-2 ring-offset-background ring-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-0.5">
                <Avatar className="w-full h-full">
                  <AvatarImage
                    src={displayProfile?.avatar_url || undefined}
                    alt={displayProfile?.display_name || "Профиль"}
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                  />
                  <AvatarFallback className="bg-violet-500 text-white text-2xl font-semibold">
                    {displayProfile?.display_name?.charAt(0)?.toUpperCase() || <User className="w-8 h-8" />}
                  </AvatarFallback>
                </Avatar>
              </div>
            </button>
            {isOwnProfile && (
              <button
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary border-2 border-background flex items-center justify-center shadow"
                onClick={() => setShowCreateModal(true)}
              >
                <Plus className="w-4 h-4 text-white" />
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="flex-1 pt-1">
            <div className="flex items-center gap-1 mb-2">
              <span className="font-semibold text-foreground text-base">
                {displayProfile?.display_name || "Пользователь"}
              </span>
              {displayProfileMeta?.status_emoji && (
                <span>{displayProfileMeta.status_emoji}</span>
              )}
              {displayProfile?.verified && <VerifiedBadge size="sm" />}
            </div>
            {displayProfileMeta?.category && (
              <p className="text-xs text-muted-foreground mb-2">{displayProfileMeta.category}</p>
            )}
            <div className="flex items-center gap-5">
              <div className="text-center">
                {/* ИСПРАВЛЕНИЕ дефекта #17: показываем реальный счётчик постов, не только медиа */}
                <p className="font-bold text-foreground text-sm">
                  {displayProfile?.stats?.postsCount ?? posts.length}
                </p>
                <p className="text-xs text-muted-foreground">публикации</p>
              </div>
              <button onClick={() => setShowFollowers(true)} className="text-center">
                {/* ИСПРАВЛЕНИЕ дефекта #16: используем оптимистичный счётчик */}
                <p className="font-bold text-foreground text-sm">{formatNumber(displayFollowersCount)}</p>
                <p className="text-xs text-muted-foreground">подписчики</p>
              </button>
              <button onClick={() => setShowFollowing(true)} className="text-center">
                <p className="font-bold text-foreground text-sm">{formatNumber(displayProfile?.stats?.followingCount ?? 0)}</p>
                <p className="text-xs text-muted-foreground">подписки</p>
              </button>
            </div>
          </div>
        </div>

        {/* Bio */}
        {(displayProfile?.bio || displayProfile?.website) && (
          <div className="mt-3 space-y-0.5">
            {displayProfile?.bio && (
              <p className="text-sm text-foreground whitespace-pre-line">{formatBioForDisplay(displayProfile.bio)}</p>
            )}
            {displayProfile?.website && (
              <a
                href={displayProfile.website.startsWith("http") ? displayProfile.website : `https://${displayProfile.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#6ab3f3] font-medium flex items-center gap-1"
              >
                <Link className="w-3 h-3" />
                {displayProfile.website.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>
        )}

        {/* Business action buttons */}
        {!isOwnProfile && displayProfileMeta?.account_type === "business" && (
          <BusinessActionButtons
            email={displayProfileMeta?.action_email}
            phone={displayProfileMeta?.action_phone}
            address={displayProfileMeta?.action_address}
          />
        )}

        {/* Professional Dashboard link (own profile, creator/business) */}
        {isOwnProfile && ["creator", "business"].includes(displayProfileMeta?.account_type ?? "") && (
          <button
            onClick={() => navigate("/professional-dashboard")}
            className="w-full mt-2 py-2 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl text-sm font-semibold text-white"
          >
            Профессиональный дашборд
          </button>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-4">
          {isOwnProfile ? (
            <>
              <button
                onClick={() => setShowEditProfile(true)}
                className="flex-1 py-2 bg-muted rounded-xl text-sm font-semibold text-foreground hover:bg-muted/80 transition-colors"
              >
                Редактировать профиль
              </button>
              <button
                onClick={() => {
                  const url = buildProfileUrl({ username: displayProfile?.username, userId: user?.id });
                  navigator.clipboard.writeText(url).then(() => toast.success("Ссылка скопирована"));
                }}
                className="flex-1 py-2 bg-muted rounded-xl text-sm font-semibold text-foreground hover:bg-muted/80 transition-colors"
              >
                Поделиться профилем
              </button>
            </>
          ) : (
            <>
              {/* ИСПРАВЛЕНИЕ дефекта #16: используем displayIsFollowing (оптимистичное состояние) */}
              <button
                onClick={handleFollowToggle}
                disabled={followPending}
                className={cn(
                  "flex-1 py-2 rounded-xl text-sm font-semibold transition-colors",
                  displayIsFollowing
                    ? "bg-muted text-foreground hover:bg-muted/80"
                    : "bg-primary text-primary-foreground hover:bg-primary/80",
                  followPending && "opacity-70 cursor-not-allowed"
                )}
              >
                {displayIsFollowing ? "Подписки" : "Подписаться"}
              </button>
              <button
                onClick={() => navigate(`/chat?userId=${targetUserId}`)}
                className="flex-1 py-2 bg-muted rounded-xl text-sm font-semibold text-foreground hover:bg-muted/80 transition-colors"
              >
                Сообщение
              </button>
              <button
                onClick={() => setShowMenu(true)}
                className="w-10 py-2 bg-muted rounded-xl flex items-center justify-center"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Highlights ── */}
      <div className="border-t border-border">
        <div className="flex items-center gap-4 px-4 py-4 overflow-x-auto scrollbar-hide">
          {isOwnProfile && (
            <HighlightCircle
              title="Новое"
              isNew
              onClick={() => setShowCreateHighlight(true)}
            />
          )}
          {highlightsLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5 min-w-[72px]">
                  <div className="w-16 h-16 rounded-full bg-muted animate-pulse" />
                  <div className="w-10 h-2.5 bg-muted animate-pulse rounded" />
                </div>
              ))
            : highlights.map(h => (
                <HighlightCircle
                  key={h.id}
                  id={h.id}
                  title={h.title}
                  coverUrl={h.cover_url}
                  onLongPress={
                    // ИСПРАВЛЕНИЕ дефекта #18: AlertDialog вместо confirm()
                    isOwnProfile
                      ? () => setHighlightToDelete(h.id)
                      : undefined
                  }
                />
              ))}
        </div>
      </div>

      {targetUserId && pinnedPosts.length > 0 && (
        <PinnedPosts
          userId={targetUserId}
          isOwner={isOwnProfile}
          pinnedPosts={pinnedPosts}
          onPostPress={(postId) => navigate(`/post/${postId}`)}
          onRefresh={() => {
            void refreshPinnedPosts();
          }}
        />
      )}

      {/* ── Tabs ── */}
      <div className="border-t border-border sticky top-0 z-10 bg-background">
        <div className="flex">
          {allTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id as TabId)}
                className={cn(
                  "flex-1 flex items-center justify-center py-3 border-b-2 transition-colors",
                  isActive ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"
                )}
              >
                <Icon className={cn("w-5 h-5", tab.id === "reels" && isActive && "fill-current")} />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === "posts" && (
            <ProfileGrid
              items={gridPosts}
              loading={postsLoading}
              type="posts"
              onItemClick={(item) => {
                if (!item?.id) return;
                navigate(`/post/${item.id}`);
              }}
            />
          )}
          {activeTab === "reels" && (
            <>
              <ProfileGrid
                items={myReels}
                loading={myReelsLoading && myReels.length === 0}
                type="reels"
                onItemClick={(item) => {
                  if (!item?.id) return;
                  // ИСПРАВЛЕНИЕ: открываем конкретный Reel автора, не общую ленту
                  navigate(`/reels?userId=${targetUserId}&startId=${item.id}`);
                }}
              />
              {myReels.length > 0 && myReelsHasMore && (
                <div className="flex justify-center py-4">
                  <Button variant="outline" onClick={() => void loadMyReels()} disabled={myReelsLoading}>
                    {myReelsLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Загрузить ещё
                  </Button>
                </div>
              )}
            </>
          )}
          {activeTab === "tagged" && targetUserId && (
            <TaggedPostsGrid userId={targetUserId} />
          )}
          {activeTab === "saved" && isOwnProfile && (
            <SavedCollections />
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Modals ── */}
      <CreateContentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={(contentType: ContentType) => {
          setShowCreateModal(false);
          if (contentType === "reel") navigate("/create?tab=reels&auto=1");
        }}
      />

      {targetUserId && (
        <>
          <FollowersSheet
            isOpen={showFollowers}
            onClose={() => setShowFollowers(false)}
            userId={targetUserId}
            type="followers"
            title="Подписчики"
          />
          <FollowersSheet
            isOpen={showFollowing}
            onClose={() => setShowFollowing(false)}
            userId={targetUserId}
            type="following"
            title="Подписки"
          />
        </>
      )}

      {isOwnProfile && displayProfile && user && (
        <EditProfileSheet
          isOpen={showEditProfile}
          onClose={() => setShowEditProfile(false)}
          profile={displayProfile}
          userId={user.id}
          onSaved={(updated) => {
            updateProfile(updated);
            refetch();
          }}
        />
      )}

      <ProfileMenu
        isOpen={showMenu}
        onClose={() => setShowMenu(false)}
        isOwnProfile={isOwnProfile}
        username={displayProfile?.username || undefined}
        userId={targetUserId}
        onBlock={handleBlock}
        onArchive={() => { setShowMenu(false); setShowArchive(true); }}
        onSettings={() => { setShowMenu(false); navigate("/settings"); }}
      />

      {isOwnProfile && user && (
        <CreateHighlightSheet
          isOpen={showCreateHighlight}
          onClose={() => setShowCreateHighlight(false)}
          userId={user.id}
          onCreated={loadHighlights}
        />
      )}

      {/* QR Code */}
      {isOwnProfile && user && displayProfile && (
        <ProfileQRCode
          isOpen={showQR}
          onClose={() => setShowQR(false)}
          username={displayProfile.username || user.id}
          userId={user.id}
          avatarUrl={displayProfile.avatar_url || undefined}
        />
      )}

      {/* ИСПРАВЛЕНИЕ дефекта #18: AlertDialog для удаления Highlight вместо confirm() */}
      <AlertDialog open={!!highlightToDelete} onOpenChange={(open) => !open && setHighlightToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить подборку?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Подборка будет удалена навсегда.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (highlightToDelete) {
                  handleDeleteHighlight(highlightToDelete);
                  setHighlightToDelete(null);
                }
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

