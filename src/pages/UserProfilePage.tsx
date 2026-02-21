import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Grid3X3, Bookmark, Heart, Play, MoreHorizontal, MessageCircle, Loader2, User, Eye, AtSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useProfileByUsername, useUserPosts } from "@/hooks/useProfile";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FollowersSheet } from "@/components/profile/FollowersSheet";
import { StoryViewer } from "@/components/feed/StoryViewer";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { HighlightsManager } from "@/components/profile/HighlightsManager";
import type { Story, UserWithStories } from "@/hooks/useStories";

const tabs = [
  { id: "posts", icon: Grid3X3 },
  { id: "reels", icon: Play },
  { id: "tagged", icon: AtSign },
];

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return num.toString();
}

export function UserProfilePage() {
  const { username: rawUsername } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState("posts");
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [showFollowers, setShowFollowers] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [profileStoriesUsers, setProfileStoriesUsers] = useState<UserWithStories[]>([]);

  // Decode URI component to handle spaces and special characters
  const username = rawUsername ? decodeURIComponent(rawUsername) : undefined;

  const { profile, loading: profileLoading, error, follow, unfollow } = useProfileByUsername(username);
  const { posts, loading: postsLoading } = useUserPosts(profile?.user_id);
  const [userReels, setUserReels] = useState<any[]>([]);
  const [userReelsLoading, setUserReelsLoading] = useState(false);
  const [userReelsError, setUserReelsError] = useState<string | null>(null);
  const [userReelsHasMore, setUserReelsHasMore] = useState(true);
  const [hasUnviewedStories, setHasUnviewedStories] = useState(false);
  const [hasAnyStories, setHasAnyStories] = useState(false);

  const loadUserReels = async (opts?: { reset?: boolean }) => {
    if (!profile?.user_id) return;
    const reset = Boolean(opts?.reset);

    if (userReelsLoading) return;
    if (!reset && !userReelsHasMore) return;

    setUserReelsLoading(true);
    setUserReelsError(null);
    try {
      const limit = 30;
      const offset = reset ? 0 : userReels.length;
      const { data, error: reelsError } = await (supabase as any).rpc("get_user_reels_v1", {
        p_author_id: profile.user_id,
        p_limit: limit,
        p_offset: offset,
      });
      if (reelsError) throw reelsError;

      const rows = (data || []) as any[];
      setUserReels((prev) => (reset ? rows : [...prev, ...rows]));
      setUserReelsHasMore(rows.length >= limit);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setUserReelsError(msg);
    } finally {
      setUserReelsLoading(false);
    }
  };

  const openProfileStories = async () => {
    if (!profile?.user_id) return;

    try {
      const { data: stories, error: storiesError } = await supabase
        .from('stories')
        .select('id, author_id, media_url, media_type, caption, created_at, expires_at')
        .eq('author_id', profile.user_id)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true });

      if (storiesError) throw storiesError;
      const activeStories = (stories || []) as Story[];

      if (activeStories.length === 0) return;

      const userEntry: UserWithStories = {
        user_id: profile.user_id,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        verified: profile.verified,
        stories: activeStories,
        // viewed влияет только на UI, но не на возможность открыть
        hasNew: hasUnviewedStories,
        isOwn: Boolean(currentUser && currentUser.id === profile.user_id),
      };

      setProfileStoriesUsers([userEntry]);
      setStoryViewerOpen(true);
    } catch (e) {
      console.error('Error opening profile stories:', e);
    }
  };

  // Check if user has UNVIEWED active stories (not just any stories)
  useEffect(() => {
    const checkUserStories = async () => {
      if (!profile?.user_id) {
        setHasUnviewedStories(false);
        setHasAnyStories(false);
        return;
      }

      try {
        // Step 1: Get all active (non-expired) stories for this user
        const { data: activeStories, error: storiesError } = await supabase
          .from('stories')
          .select('id')
          .eq('author_id', profile.user_id)
          .gt('expires_at', new Date().toISOString());

        if (storiesError || !activeStories || activeStories.length === 0) {
          setHasUnviewedStories(false);
          setHasAnyStories(false);
          return;
        }

        setHasAnyStories(true);

        // Step 2: Check which of these stories the current user has viewed
        if (currentUser) {
          const storyIds = activeStories.map(s => s.id);
          
          const { data: viewedStories, error: viewsError } = await supabase
            .from('story_views')
            .select('story_id')
            .eq('viewer_id', currentUser.id)
            .in('story_id', storyIds);

          if (viewsError) {
            console.error('Error checking story views:', viewsError);
            setHasUnviewedStories(true); // Assume unviewed on error
            return;
          }

          const viewedIds = new Set((viewedStories || []).map(v => v.story_id));
          
          // Check if there are ANY unviewed stories
          const hasUnviewed = activeStories.some(s => !viewedIds.has(s.id));
          setHasUnviewedStories(hasUnviewed);
        } else {
          // Not logged in - show as unviewed (will prompt login)
          setHasUnviewedStories(true);
        }
      } catch (err) {
        console.error('Error checking stories:', err);
        setHasUnviewedStories(false);
        setHasAnyStories(false);
      }
    };

    checkUserStories();
  }, [profile?.user_id, currentUser]);

  useEffect(() => {
    setUserReels([]);
    setUserReelsHasMore(true);
    setUserReelsError(null);
    // Only fetch when the profile is resolved AND the tab is actually opened.
    // (We keep the fetch on tab switch below.)
  }, [profile?.user_id]);

  const handleFollowToggle = async () => {
    if (!currentUser) {
      toast.error("Войдите, чтобы подписаться");
      navigate("/auth");
      return;
    }

    try {
      if (profile?.isFollowing) {
        await unfollow();
        toast.success("Вы отписались");
      } else {
        await follow();
        toast.success("Вы подписались");
      }
    } catch (err) {
      toast.error("Не удалось выполнить действие");
    }
  };

  const handleMessage = async () => {
    if (!currentUser) {
      toast.error("Войдите, чтобы написать сообщение");
      navigate("/auth");
      return;
    }

    if (!profile) return;

    setIsCreatingChat(true);

    try {
      // Use user_id directly instead of display_name to avoid ambiguity
      const { data: conversationId, error: rpcError } = await supabase
        .rpc("get_or_create_dm", { target_user_id: profile.user_id });

      if (rpcError) throw rpcError;

      navigate("/chats", { 
        state: { 
          conversationId, 
          otherUserId: profile.user_id,
          otherDisplayName: profile.display_name || "Пользователь",
          otherAvatarUrl: profile.avatar_url 
        } 
      });

    } catch (error) {
      console.error("[Chat] Error:", error);
      const msg = error instanceof Error ? error.message : String(error);
      
      if (msg.includes("Cannot message yourself")) {
        toast.error("Нельзя написать самому себе");
      } else if (msg.includes("Target not registered")) {
        toast.info("Этот пользователь ещё не зарегистрирован");
      } else {
        toast.error("Не удалось открыть чат", { description: msg });
      }
    } finally {
      setIsCreatingChat(false);
    }
  };

  // Get first media URL for a post
  const getPostImage = (post: any): string | null => {
    if (post.post_media && post.post_media.length > 0) {
      return post.post_media[0].media_url;
    }
    return null;
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h2 className="font-semibold text-foreground">Профиль</h2>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-8 mt-20">
          <User className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">Пользователь не найден</h2>
          <p className="text-muted-foreground text-center">
            Возможно, аккаунт был удалён или никнейм введён неверно
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-1.5">
          <h2 className="font-semibold text-foreground">{profile.display_name}</h2>
          {profile.verified && <VerifiedBadge size="md" />}
        </div>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="w-5 h-5" />
        </Button>
      </div>

      {/* Profile Info Row - Same layout as ProfilePage */}
      <div className="px-4 py-4">
        <div className="flex items-start gap-4">
          {/* Avatar with gradient ring - only show if user has UNVIEWED stories */}
          <div className="relative">
            <button
              type="button"
              onClick={openProfileStories}
              className={cn(
                "w-20 h-20 rounded-full p-[2.5px]",
                hasUnviewedStories
                  ? "bg-gradient-to-tr from-primary via-accent to-primary"
                  : hasAnyStories
                    ? "bg-muted-foreground/40" // просмотрено
                    : "bg-muted" // нет сторис
              )}
              aria-label="Open stories"
            >
              <div className="w-full h-full rounded-full bg-background p-[2px]">
                <Avatar className="w-full h-full">
                  <AvatarImage src={profile.avatar_url || undefined} alt={profile.display_name || 'Profile'} />
                  <AvatarFallback className="bg-muted">
                    <User className="w-8 h-8 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
              </div>
            </button>
          </div>

          {/* Stats */}
          <div className="flex-1">
            <div className="flex items-center gap-1.5 mb-2">
              <h1 className="text-lg font-semibold">{profile.display_name || 'Пользователь'}</h1>
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
          <p className="text-sm text-foreground">{profile.bio || ''}</p>
          {profile.website && (
            <a href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`} 
               target="_blank" 
               rel="noopener noreferrer"
               className="text-sm text-primary font-medium">
              {profile.website}
            </a>
          )}
        </div>

        {/* Action Buttons - Follow + Message */}
        {!profile.isOwnProfile && (
          <div className="flex items-center gap-1.5 mt-4">
            <Button 
              onClick={handleFollowToggle}
              variant={profile.isFollowing ? "secondary" : "default"}
              className="flex-1 rounded-lg h-8 text-sm font-semibold px-3"
            >
              {profile.isFollowing ? "Отписаться" : "Подписаться"}
            </Button>
            <Button 
              variant="secondary" 
              className="flex-1 rounded-lg h-8 text-sm font-semibold px-3 gap-2"
              onClick={handleMessage}
              disabled={isCreatingChat}
            >
              {isCreatingChat ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <MessageCircle className="w-4 h-4" />
              )}
              Сообщение
            </Button>
          </div>
        )}
      </div>

      {/* Highlights Section */}
      <div className="px-4 py-4 border-t border-border">
        <HighlightsManager 
          userId={profile.user_id} 
          isOwnProfile={Boolean(currentUser && currentUser.id === profile.user_id)} 
        />
      </div>

      {/* Content Tabs */}
      <div className="border-t border-border sticky top-0 z-10 bg-card">
        <div className="flex">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id === "reels") {
                    void loadUserReels({ reset: true });
                  }
                }}
                className={cn(
                  "flex-1 flex items-center justify-center py-3 transition-all border-b-2",
                  isActive
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("w-6 h-6", tab.id === "reels" && "fill-current")} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Posts Grid */}
      <div className="pb-20">
        {activeTab === "posts" && (
          <>
            {postsLoading ? (
              <div className="p-12 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : posts.length > 0 ? (
              <div className="grid grid-cols-3 gap-[2px]">
                {posts.map((post) => {
                  const imageUrl = getPostImage(post);
                  const isVideo = post.post_media?.[0]?.media_type === 'video';
                  return (
                    <div key={post.id} className="aspect-square relative group cursor-pointer overflow-hidden bg-muted">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={`Post ${post.id}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Grid3X3 className="w-6 h-6 text-muted-foreground" />
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
              <div className="p-12 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <Grid3X3 className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">Нет публикаций</h3>
                <p className="text-sm text-muted-foreground">Пользователь ещё ничего не опубликовал</p>
              </div>
            )}
          </>
        )}

        {activeTab === "reels" && (
          <div className="px-4 py-4">
            {userReelsLoading && userReels.length === 0 ? (
              <div className="py-12 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : userReelsError ? (
              <div className="py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <Play className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">Reels</h3>
                <p className="text-sm text-muted-foreground">Не удалось загрузить Reels</p>
                <div className="mt-4">
                  <Button variant="outline" onClick={() => void loadUserReels({ reset: true })}>
                    Повторить
                  </Button>
                </div>
              </div>
            ) : userReels.length > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-1 rounded-2xl overflow-hidden">
                  {userReels.map((reel) => (
                    <div key={reel.id} className="aspect-square relative overflow-hidden bg-muted/40">
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

                {userReelsHasMore && (
                  <div className="pt-4 flex justify-center">
                    <Button
                      variant="outline"
                      disabled={userReelsLoading}
                      onClick={() => void loadUserReels()}
                    >
                      {userReelsLoading ? (
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
            ) : (
              <div className="py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <Play className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">Reels</h3>
                <p className="text-sm text-muted-foreground">Пользователь ещё не опубликовал Reels</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "tagged" && (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <AtSign className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">Отметки</h3>
            <p className="text-sm text-muted-foreground">Публикации с отметками пользователя</p>
          </div>
        )}
      </div>

      {/* Followers/Following Sheets */}
      <FollowersSheet
        isOpen={showFollowers}
        onClose={() => setShowFollowers(false)}
        userId={profile.user_id}
        type="followers"
        title="Подписчики"
      />
      <FollowersSheet
        isOpen={showFollowing}
        onClose={() => setShowFollowing(false)}
        userId={profile.user_id}
        type="following"
        title="Подписки"
      />

      {/* Story Viewer (profile) */}
      <StoryViewer
        usersWithStories={profileStoriesUsers}
        initialUserIndex={0}
        isOpen={storyViewerOpen}
        onClose={() => setStoryViewerOpen(false)}
      />
    </div>
  );
}