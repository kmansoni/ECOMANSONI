import { useState, useEffect, useCallback } from "react";
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
import { useProfile, useUserPosts } from "@/hooks/useProfile";
import { getHighlights, deleteHighlight, blockUser, Highlight } from "@/hooks/useProfile";
import { useSavedPosts } from "@/hooks/useSavedPosts";
import { useAuth } from "@/hooks/useAuth";
import { normalizeReelMediaUrl } from "@/lib/reels/media";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { ContentType } from "@/hooks/useMediaEditor";
import { toast } from "sonner";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
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
  const { savedPosts, fetchSavedPosts, loading: savedLoading } = useSavedPosts();

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

  const [myReels, setMyReels] = useState<any[]>([]);
  const [myReelsLoading, setMyReelsLoading] = useState(false);
  const [myReelsHasMore, setMyReelsHasMore] = useState(true);

  // Load highlights
  const loadHighlights = useCallback(async () => {
    if (!targetUserId) return;
    setHighlightsLoading(true);
    try {
      const data = await getHighlights(targetUserId);
      setHighlights(data);
    } catch {
      // ignore
    } finally {
      setHighlightsLoading(false);
    }
  }, [targetUserId]);

  useEffect(() => {
    loadHighlights();
  }, [loadHighlights]);

  // Load reels on tab switch
  const loadMyReels = useCallback(async (opts?: { reset?: boolean }) => {
    if (!targetUserId || myReelsLoading) return;
    const reset = Boolean(opts?.reset);
    if (!reset && !myReelsHasMore) return;
    setMyReelsLoading(true);
    try {
      const limit = 30;
      const offset = reset ? 0 : myReels.length;
      const { data, error } = await (supabase as any).rpc("get_user_reels_v1", {
        p_author_id: targetUserId,
        p_limit: limit,
        p_offset: offset,
      });
      if (error) throw error;
      const rows = (data || []).map((r: any) => ({
        ...r,
        video_url: normalizeReelMediaUrl(r?.video_url, "reels-media"),
        thumbnail_url: normalizeReelMediaUrl(r?.thumbnail_url, "reels-media") || r?.thumbnail_url,
      }));
      setMyReels(prev => (reset ? rows : [...prev, ...rows]));
      setMyReelsHasMore(rows.length >= limit);
    } catch {
      // ignore
    } finally {
      setMyReelsLoading(false);
    }
  }, [targetUserId, myReelsLoading, myReelsHasMore, myReels.length]);

  const handleTabChange = (tabId: TabId) => {
    setActiveTab(tabId);
    if (tabId === "saved") fetchSavedPosts();
    if (tabId === "reels") void loadMyReels({ reset: true });
  };

  useEffect(() => {
    setMyReels([]);
    setMyReelsHasMore(true);
  }, [targetUserId]);

  const handleDeleteHighlight = async (id: string) => {
    try {
      await deleteHighlight(id);
      setHighlights(prev => prev.filter(h => h.id !== id));
      toast.success("Подборка удалена");
    } catch {
      toast.error("Не удалось удалить подборку");
    }
  };

  const handleBlock = async () => {
    if (!user || !targetUserId) return;
    try {
      await blockUser(user.id, targetUserId);
      toast.success("Пользователь заблокирован");
      navigate(-1);
    } catch {
      toast.error("Не удалось заблокировать");
    }
  };

  const handleFollowToggle = async () => {
    try {
      if (profile?.isFollowing) {
        await unfollow();
        toast.success("Вы отписались");
      } else {
        await follow();
        toast.success("Вы подписались");
      }
    } catch {
      toast.error("Не удалось выполнить действие");
    }
  };

  // ── Loading state ──────────────────────────────────────────────
  if (profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
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
                  <AvatarImage src={displayProfile?.avatar_url || undefined} />
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
              {(displayProfile as any)?.status_emoji && (
                <span>{(displayProfile as any).status_emoji}</span>
              )}
              {displayProfile?.verified && <VerifiedBadge size="sm" />}
            </div>
            {(displayProfile as any)?.category && (
              <p className="text-xs text-muted-foreground mb-2">{(displayProfile as any).category}</p>
            )}
            <div className="flex items-center gap-5">
              <div className="text-center">
                <p className="font-bold text-foreground text-sm">{displayProfile?.stats?.postsCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">публикации</p>
              </div>
              <button onClick={() => setShowFollowers(true)} className="text-center">
                <p className="font-bold text-foreground text-sm">{formatNumber(displayProfile?.stats?.followersCount ?? 0)}</p>
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
              <p className="text-sm text-foreground whitespace-pre-line">{displayProfile.bio}</p>
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
        {!isOwnProfile && (displayProfile as any)?.account_type === "business" && (
          <BusinessActionButtons
            email={(displayProfile as any)?.action_email}
            phone={(displayProfile as any)?.action_phone}
            address={(displayProfile as any)?.action_address}
          />
        )}

        {/* Professional Dashboard link (own profile, creator/business) */}
        {isOwnProfile && ["creator", "business"].includes((displayProfile as any)?.account_type ?? "") && (
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
                  const url = `https://mansoni.ru/user/${user?.id}`;
                  navigator.clipboard.writeText(url).then(() => toast.success("Ссылка скопирована"));
                }}
                className="flex-1 py-2 bg-muted rounded-xl text-sm font-semibold text-foreground hover:bg-muted/80 transition-colors"
              >
                Поделиться профилем
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleFollowToggle}
                className={cn(
                  "flex-1 py-2 rounded-xl text-sm font-semibold transition-colors",
                  displayProfile?.isFollowing
                    ? "bg-muted text-foreground hover:bg-muted/80"
                    : "bg-primary text-primary-foreground hover:bg-primary/80"
                )}
              >
                {displayProfile?.isFollowing ? "Подписки" : "Подписаться"}
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
                    isOwnProfile
                      ? () => {
                          if (confirm(`Удалить подборку "${h.title}"?`)) {
                            handleDeleteHighlight(h.id);
                          }
                        }
                      : undefined
                  }
                />
              ))}
        </div>
      </div>

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
            <ProfileGrid items={posts} loading={postsLoading} type="posts" />
          )}
          {activeTab === "reels" && (
            <>
              <ProfileGrid items={myReels} loading={myReelsLoading && myReels.length === 0} type="reels" />
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
        username={displayProfile?.display_name || undefined}
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
          username={displayProfile.display_name || user.id}
          userId={user.id}
          avatarUrl={displayProfile.avatar_url || undefined}
        />
      )}
    </div>
  );
}

