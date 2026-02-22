import { Settings, Grid3X3, Bookmark, Play, Plus, Share2, Eye, User, Loader2, Edit3, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { CreateMenu } from "@/components/feed/CreateMenu";
import { FollowersSheet } from "@/components/profile/FollowersSheet";
import { useProfile, useUserPosts } from "@/hooks/useProfile";
import { useSavedPosts } from "@/hooks/useSavedPosts";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { HighlightsManager } from "@/components/profile/HighlightsManager";
import { supabase } from "@/integrations/supabase/client";

const tabs = [
  { id: "posts", icon: Grid3X3, label: "Публикации" },
  { id: "saved", icon: Bookmark, label: "Сохраненное" },
  { id: "reels", icon: Play, label: "Reels" },
];

type UserReelRow = {
  id: string;
  author_id: string;
  video_url: string;
  thumbnail_url: string | null;
  created_at: string;
};

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return num.toString();
}

export function ProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, loading: profileLoading, updateProfile } = useProfile();
  const { posts, loading: postsLoading } = useUserPosts();
  const { savedPosts, fetchSavedPosts, loading: savedLoading } = useSavedPosts();
  
  const [activeTab, setActiveTab] = useState("posts");
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  
  const [showFollowers, setShowFollowers] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);

  const [myReels, setMyReels] = useState<UserReelRow[]>([]);
  const [myReelsLoading, setMyReelsLoading] = useState(false);
  const [myReelsError, setMyReelsError] = useState<string | null>(null);
  const [myReelsHasMore, setMyReelsHasMore] = useState(true);

  const loadMyReels = async (opts?: { reset?: boolean }) => {
    if (!user) return;
    const reset = Boolean(opts?.reset);

    if (myReelsLoading) return;
    if (!reset && !myReelsHasMore) return;

    setMyReelsLoading(true);
    setMyReelsError(null);
    try {
      const limit = 30;
      const offset = reset ? 0 : myReels.length;
      const { data, error } = await (supabase as any).rpc("get_user_reels_v1", {
        p_author_id: user.id,
        p_limit: limit,
        p_offset: offset,
      });
      if (error) throw error;

      const rows = (data || []) as UserReelRow[];
      setMyReels((prev) => (reset ? rows : [...prev, ...rows]));
      setMyReelsHasMore(rows.length >= limit);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMyReelsError(msg);
    } finally {
      setMyReelsLoading(false);
    }
  };

  const handleCreateSelect = (type: string) => {
    navigate(`/create?tab=${encodeURIComponent(type)}&auto=1`);
  };

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    if (tabId === "saved") {
      fetchSavedPosts();
    }
    if (tabId === "reels") {
      // Fetch on-demand when the user opens the Reels tab.
      void loadMyReels({ reset: true });
    }
  };

  useEffect(() => {
    // If the user changes (sign out/in), reset cached reels.
    setMyReels([]);
    setMyReelsHasMore(true);
    setMyReelsError(null);
  }, [user?.id]);

  // Get first media URL for a post
  const getPostImage = (post: any): string | null => {
    if (post.post_media && post.post_media.length > 0) {
      return post.post_media[0].media_url;
    }
    return null;
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden">
        <div className="relative z-10 min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden">
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4">
          <div className="w-20 h-20 rounded-full bg-card/80 backdrop-blur-xl border border-border flex items-center justify-center mb-4">
            <User className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">Войдите в аккаунт</h2>
          <p className="text-muted-foreground text-center mb-4">
            Чтобы просматривать свой профиль, войдите в аккаунт
          </p>
          <button 
            onClick={() => navigate('/auth')}
            className="px-6 py-3 bg-card/80 backdrop-blur-xl rounded-2xl border border-border text-white font-medium hover:bg-white/20 transition-colors"
          >
            Войти
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Content */}
      <div className="relative z-10 min-h-screen pb-24">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 safe-area-top">
          <button
            type="button"
            onClick={() => setShowCreateMenu(true)}
            className="w-10 h-10 rounded-full bg-card/80 backdrop-blur-xl border border-border flex items-center justify-center hover:bg-muted/50 transition-colors"
            aria-label="Создать"
          >
            <Plus className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex items-center gap-1.5">
            <h1 className="font-semibold text-lg text-foreground">{profile.display_name || 'Профиль'}{(profile as any).status_emoji ? ` ${(profile as any).status_emoji}` : ""}</h1>
            {profile.verified && <VerifiedBadge size="md" />}
          </div>
          <button 
            onClick={() => navigate('/settings')}
            className="w-10 h-10 rounded-full bg-card/80 backdrop-blur-xl border border-border flex items-center justify-center hover:bg-muted/50 transition-colors"
          >
            <Settings className="w-5 h-5 text-foreground" />
          </button>
        </div>

        {/* Profile Info Row */}
        <div className="px-4 py-4">
          <div className="flex items-start gap-4">
            {/* Avatar - clickable to open create menu */}
            <button 
              className="relative cursor-pointer"
              onClick={() => setShowCreateMenu(true)}
            >
              <div className="absolute -inset-1 rounded-full bg-gradient-to-br from-white/20 via-white/5 to-white/10 backdrop-blur-xl" />
              <Avatar className="w-20 h-20 border-2 border-border relative">
                <AvatarImage src={profile.avatar_url || undefined} alt={profile.display_name || 'Profile'} />
                <AvatarFallback className="bg-violet-500/80 backdrop-blur-xl text-white text-2xl font-medium">
                  {profile.display_name?.charAt(0)?.toUpperCase() || <User className="w-8 h-8" />}
                </AvatarFallback>
              </Avatar>

              {(profile as any).status_sticker_url ? (
                <img
                  src={(profile as any).status_sticker_url}
                  alt="status sticker"
                  className="absolute -bottom-2 -left-2 w-10 h-10 rounded-xl object-cover bg-card/80 border border-border"
                />
              ) : null}
              {/* Add story button */}
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary border-2 border-border flex items-center justify-center">
                <Plus className="w-4 h-4 text-primary-foreground" />
              </div>
            </button>

            {/* Stats */}
            <div className="flex-1">
              <div className="flex items-center gap-1.5 mb-2">
                <h1 className="text-lg font-semibold text-foreground">{profile.display_name || 'Пользователь'}</h1>
                {(profile as any).status_emoji ? (
                  <span className="text-lg leading-none">{(profile as any).status_emoji}</span>
                ) : null}
                {profile.verified && <VerifiedBadge size="md" />}
              </div>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="font-bold text-foreground">{profile.stats.postsCount}</p>
                  <p className="text-xs text-muted-foreground">публикации</p>
                </div>
                <button 
                  className="text-center"
                  onClick={() => setShowFollowers(true)}
                >
                  <p className="font-bold text-foreground">{formatNumber(profile.stats.followersCount)}</p>
                  <p className="text-xs text-muted-foreground">подписчики</p>
                </button>
                <button 
                  className="text-center"
                  onClick={() => setShowFollowing(true)}
                >
                  <p className="font-bold text-foreground">{formatNumber(profile.stats.followingCount)}</p>
                  <p className="text-xs text-muted-foreground">подписки</p>
                </button>
              </div>
            </div>
          </div>

          {/* Bio */}
          <div className="mt-3">
            {profile.bio && (
              <p className="text-sm text-foreground">{profile.bio}</p>
            )}
            {profile.website && (
              <a href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`} 
                 target="_blank" 
                 rel="noopener noreferrer"
                 className="text-sm text-[#6ab3f3] font-medium">
                {profile.website}
              </a>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 mt-4">
            <button 
              onClick={() => navigate('/profile/edit')}
              className="px-4 py-2 bg-card/80 backdrop-blur-xl rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted/50 transition-colors"
            >
              Редактировать профиль
            </button>
            <button className="px-4 py-2 bg-card/80 backdrop-blur-xl rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted/50 transition-colors">
              Поделиться профилем
            </button>
          </div>
        </div>

        {/* Highlights Section */}
        <div className="px-4 py-4 border-t border-border mt-4">
          <HighlightsManager userId={user?.id || ''} isOwnProfile={true} />
        </div>

        {/* Content Tabs */}
        <div className="px-4 mb-3">
          <div className="bg-card/80 backdrop-blur-xl rounded-2xl border border-border p-1 flex">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={cn(
                    "flex-1 flex items-center justify-center py-2.5 rounded-xl transition-all",
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className={cn("w-5 h-5", tab.id === "reels" && "fill-current")} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Posts Grid */}
        <div className="px-4">
          {activeTab === "posts" && (
            <>
              {postsLoading ? (
                <div className="p-12 flex justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : posts.length > 0 ? (
                <div className="grid grid-cols-3 gap-1 rounded-2xl overflow-hidden">
                  {posts.map((post) => {
                    const imageUrl = getPostImage(post);
                    const isVideo = post.post_media?.[0]?.media_type === 'video';
                    return (
                      <div key={post.id} className="aspect-square relative group cursor-pointer overflow-hidden bg-white/10">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={`Post ${post.id}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Grid3X3 className="w-6 h-6 text-white/40" />
                          </div>
                        )}
                        {isVideo && (
                          <>
                            <div className="absolute top-2 right-2">
                              <Play className="w-5 h-5 text-white fill-white drop-shadow-lg" />
                            </div>
                            <div className="absolute bottom-2 left-2 flex items-center gap-1">
                              <Eye className="w-4 h-4 text-white drop-shadow-lg" />
                              <span className="text-white text-xs font-medium drop-shadow-lg">{post.views_count}</span>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-card/80 backdrop-blur-xl border border-border flex items-center justify-center mx-auto mb-3">
                    <Grid3X3 className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-1">Нет публикаций</h3>
                  <p className="text-sm text-muted-foreground">Создайте свой первый пост</p>
                </div>
              )}
            </>
          )}

          {activeTab === "saved" && (
            <>
              {savedLoading ? (
                <div className="p-12 flex justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : savedPosts.length > 0 ? (
                <div className="grid grid-cols-3 gap-1 rounded-2xl overflow-hidden">
                  {savedPosts.map((post: any) => {
                    const imageUrl = post.post_media?.[0]?.media_url;
                    return (
                      <div key={post.id} className="aspect-square relative group cursor-pointer overflow-hidden bg-white/10">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={`Saved ${post.id}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Bookmark className="w-6 h-6 text-white/40" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-card/80 backdrop-blur-xl border border-border flex items-center justify-center mx-auto mb-3">
                    <Bookmark className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-1">Сохраненное</h3>
                  <p className="text-sm text-muted-foreground">Сохраняйте понравившиеся публикации</p>
                </div>
              )}
            </>
          )}

          {activeTab === "reels" && (
            <>
              {myReelsLoading && myReels.length === 0 ? (
                <div className="py-12 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : myReelsError ? (
                <div className="py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-card/80 backdrop-blur-xl border border-border flex items-center justify-center mx-auto mb-3">
                    <Play className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-1">Reels</h3>
                  <p className="text-sm text-muted-foreground">Не удалось загрузить ваши Reels</p>
                  <div className="mt-4">
                    <Button variant="outline" onClick={() => void loadMyReels({ reset: true })}>
                      Повторить
                    </Button>
                  </div>
                </div>
              ) : myReels.length > 0 ? (
                <div className="grid grid-cols-3 gap-1 rounded-2xl overflow-hidden">
                  {myReels.map((reel) => (
                    <div key={reel.id} className="aspect-square relative overflow-hidden bg-card/40">
                      {reel.thumbnail_url ? (
                        <img
                          src={reel.thumbnail_url}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Play className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-card/80 backdrop-blur-xl border border-border flex items-center justify-center mx-auto mb-3">
                    <Play className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-1">Reels</h3>
                  <p className="text-sm text-muted-foreground">У вас пока нет Reels</p>
                </div>
              )}

              {myReels.length > 0 && myReelsHasMore && (
                <div className="pt-4 flex justify-center">
                  <Button
                    variant="outline"
                    disabled={myReelsLoading}
                    onClick={() => void loadMyReels()}
                  >
                    {myReelsLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Загрузка...
                      </>
                    ) : (
                      "Загрузить ещё"
                    )}
                  </Button>
                </div>
              )}
            </>
          )}

          {activeTab === "tagged" && (
            <div className="py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-card/80 backdrop-blur-xl border border-border flex items-center justify-center mx-auto mb-3">
                <AtSign className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">Отметки</h3>
              <p className="text-sm text-muted-foreground">Публикации с вашими отметками</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Menu */}
      <CreateMenu 
        isOpen={showCreateMenu} 
        onClose={() => setShowCreateMenu(false)} 
        onSelect={handleCreateSelect}
      />


      {/* Followers Sheet */}
      {user && (
        <>
          <FollowersSheet
            isOpen={showFollowers}
            onClose={() => setShowFollowers(false)}
            userId={user.id}
            type="followers"
            title="Подписчики"
          />
          <FollowersSheet
            isOpen={showFollowing}
            onClose={() => setShowFollowing(false)}
            userId={user.id}
            type="following"
            title="Подписки"
          />
        </>
      )}
    </div>
  );
}

