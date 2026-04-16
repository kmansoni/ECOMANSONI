import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Grid3X3, Bookmark, Play, Loader2, AtSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HighlightCircle } from "@/components/profile/HighlightCircle";
import { ProfileGrid } from "@/components/profile/ProfileGrid";
import { TaggedPostsGrid } from "@/components/profile/TaggedPostsGrid";
import { SavedCollections } from "@/components/profile/SavedCollections";
import { ProfilePostFeed } from "@/components/profile/ProfilePostFeed";
import { PinnedPosts } from "@/components/profile/PinnedPosts";
import { ProfilePageSkeleton, ProfileLoginPrompt } from "@/components/profile/ProfilePageSkeleton";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileModals } from "@/components/profile/ProfileModals";
import { useProfile, useUserPosts } from "@/hooks/useProfile";
import { blockUser } from "@/hooks/useProfile";
import { usePinnedPosts } from "@/hooks/usePinnedPosts";
import { useSavedPosts } from "@/hooks/useSavedPosts";
import { useAuth } from "@/hooks/useAuth";
import { useOptimisticFollow } from "@/hooks/useOptimisticFollow";
import { useProfileHighlights } from "@/hooks/useProfileHighlights";
import { useProfileReels } from "@/hooks/useProfileReels";
import { useUserHasStories } from "@/hooks/useUserHasStories";
import { cn } from "@/lib/utils";
import type { ContentType } from "@/hooks/useMediaEditor";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

type PostMediaItem = {
  media_url?: string | null;
};

type ProfileMetaExtras = {
  status_emoji?: string | null;
  category?: string | null;
  account_type?: string | null;
  action_email?: string | null;
  action_phone?: string | null;
  action_address?: string | null;
};

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

  const targetUserId = paramUserId || user?.id;
  const isOwnProfile = !paramUserId || paramUserId === user?.id;

  const { profile, loading: profileLoading, follow, unfollow, updateProfile, refetch } = useProfile(targetUserId);
  const { posts, loading: postsLoading } = useUserPosts(targetUserId);
  const { pinnedPosts, refresh: refreshPinnedPosts } = usePinnedPosts(targetUserId);
  const { savedPosts, fetchSavedPosts, loading: savedLoading } = useSavedPosts();

  // Оптимистичное follow/unfollow с откатом при ошибке
  const { displayIsFollowing, displayFollowersCount, followPending, handleFollowToggle } =
    useOptimisticFollow({
      isFollowing: profile?.isFollowing ?? false,
      followersCount: profile?.stats?.followersCount ?? 0,
      follow,
      unfollow,
      refetch,
      targetUserId,
    });

  // Story ring на аватаре
  const hasActiveStories = useUserHasStories(targetUserId);

  // Highlights
  const {
    highlights,
    highlightsLoading,
    highlightToDelete,
    setHighlightToDelete,
    loadHighlights,
    handleDeleteHighlight,
  } = useProfileHighlights(targetUserId);

  // Reels с пагинацией и AbortController
  const { myReels, myReelsLoading, myReelsHasMore, loadMyReels } = useProfileReels(targetUserId);

  // Преднагрузка аватара
  useEffect(() => {
    const avatarUrl = profile?.avatar_url?.trim();
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

  // Мемоизированные посты для грида
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

  // Состояние UI-панелей
  const [activeTab, setActiveTab] = useState<TabId>("posts");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFollowers, setShowFollowers] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showCreateHighlight, setShowCreateHighlight] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [feedPostId, setFeedPostId] = useState<string | null>(null);

  const handleTabChange = useCallback((tabId: TabId) => {
    setActiveTab(tabId);
    if (tabId === "saved") fetchSavedPosts();
    if (tabId === "reels") void loadMyReels({ reset: true });
  }, [fetchSavedPosts, loadMyReels]);

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

  // ── Loading / auth guard ──
  if (profileLoading) return <ProfilePageSkeleton />;

  if (!user && !profile) return <ProfileLoginPrompt onLogin={() => navigate("/auth")} />;

  const displayProfile = profile;
  const displayProfileMeta = displayProfile as (typeof displayProfile & ProfileMetaExtras) | null;

  const allTabs = isOwnProfile
    ? ([...TABS, { id: "saved" as const, icon: Bookmark, label: "Сохранённые" }])
    : TABS;

  // ── Render ──
  return (
    <div className="min-h-screen bg-background pb-24">
      <ProfileHeader
        profile={displayProfile}
        profileMeta={displayProfileMeta}
        isOwnProfile={isOwnProfile}
        userId={user?.id}
        targetUserId={targetUserId}
        postsCount={posts.length}
        displayFollowersCount={displayFollowersCount}
        displayIsFollowing={displayIsFollowing}
        isFollowedBy={profile?.isFollowedBy ?? false}
        hasActiveStories={hasActiveStories}
        followPending={followPending}
        onFollowToggle={handleFollowToggle}
        onNavigate={navigate}
        onNavigateBack={() => navigate(-1)}
        onEditProfile={() => setShowEditProfile(true)}
        onCreateContent={() => setShowCreateModal(true)}
        onFollowers={() => setShowFollowers(true)}
        onFollowing={() => setShowFollowing(true)}
        onMenu={() => setShowMenu(true)}
        onQR={() => setShowQR(true)}
      />

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
          onPostPress={(postId) => setFeedPostId(postId)}
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
                setFeedPostId(item.id);
              }}
            />
          )}
          {activeTab === "reels" && (
            <>
              <ProfileGrid
                items={myReels.map(r => ({ id: r.id, thumbnail_url: r.thumbnail_url ?? undefined }))}
                loading={myReelsLoading && myReels.length === 0}
                type="reels"
                onItemClick={(item) => {
                  if (!item?.id) return;
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

      {/* ── Profile Post Feed overlay ── */}
      <AnimatePresence>
        {feedPostId && profile && (
          <ProfilePostFeed
            posts={mediaPosts}
            profile={profile}
            initialPostId={feedPostId}
            pinnedPostIds={pinnedPostIds}
            onClose={() => setFeedPostId(null)}
            onPinChanged={() => void refreshPinnedPosts()}
          />
        )}
      </AnimatePresence>

      {/* ── Modals ── */}
      <ProfileModals
        isOwnProfile={isOwnProfile}
        userId={user?.id}
        targetUserId={targetUserId}
        profile={displayProfile}
        showCreateModal={showCreateModal}
        onCloseCreateModal={() => setShowCreateModal(false)}
        onContentCreated={(contentType: ContentType) => {
          setShowCreateModal(false);
          if (contentType === "reel") navigate("/create?tab=reels&auto=1");
        }}
        showFollowers={showFollowers}
        onCloseFollowers={() => setShowFollowers(false)}
        showFollowing={showFollowing}
        onCloseFollowing={() => setShowFollowing(false)}
        showEditProfile={showEditProfile}
        onCloseEditProfile={() => setShowEditProfile(false)}
        onProfileSaved={(updated) => {
          updateProfile(updated);
          refetch();
        }}
        showMenu={showMenu}
        onCloseMenu={() => setShowMenu(false)}
        onBlock={handleBlock}
        onArchive={() => { setShowMenu(false); setShowArchive(true); }}
        onSettings={() => { setShowMenu(false); navigate("/settings"); }}
        showCreateHighlight={showCreateHighlight}
        onCloseCreateHighlight={() => setShowCreateHighlight(false)}
        onHighlightCreated={loadHighlights}
        showQR={showQR}
        onCloseQR={() => setShowQR(false)}
        highlightToDelete={highlightToDelete}
        onHighlightDeleteConfirm={(id) => {
          handleDeleteHighlight(id);
          setHighlightToDelete(null);
        }}
        onHighlightDeleteCancel={() => setHighlightToDelete(null)}
      />
    </div>
  );
}

