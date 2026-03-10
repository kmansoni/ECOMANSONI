/**
 * src/pages/settings/SettingsArchiveSection.tsx
 * Screens: "archive" | "archive_stories" | "archive_posts" | "archive_live"
 */
import { useCallback, useState } from "react";
import { Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/utils";
import { SettingsHeader, SettingsMenuItem, SettingsPostsList } from "./helpers";
import type { SectionProps, SettingsPostItem, SettingsStoryItem, SettingsLiveArchiveItem } from "./types";

async function fetchPostsByIds(postIds: string[]): Promise<Map<string, SettingsPostItem>> {
  if (!postIds.length) return new Map();
  const { data, error } = await supabase
    .from("posts")
    .select("id, content, created_at, likes_count, comments_count, post_media ( media_url, sort_order )")
    .in("id", postIds);
  if (error) throw error;
  const map = new Map<string, SettingsPostItem>();
  for (const row of (data ?? []) as any[]) {
    const media = Array.isArray(row.post_media) ? row.post_media : [];
    media.sort((a: any, b: any) => (a?.sort_order ?? 0) - (b?.sort_order ?? 0));
    map.set(String(row.id), {
      id: String(row.id),
      content: row.content ?? null,
      created_at: row.created_at,
      likes_count: row.likes_count ?? 0,
      comments_count: row.comments_count ?? 0,
      media_url: media[0]?.media_url ?? null,
    });
  }
  return map;
}

type ArchiveScreen = "archive" | "archive_stories" | "archive_posts" | "archive_live";

interface ArchiveSectionProps extends SectionProps {
  currentScreen: ArchiveScreen;
}

export function SettingsArchiveSection({ isDark, currentScreen, onNavigate, onBack }: ArchiveSectionProps) {
  const { user } = useAuth();

  const [stories, setStories] = useState<SettingsStoryItem[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [posts, setPosts] = useState<SettingsPostItem[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [live, setLive] = useState<SettingsLiveArchiveItem[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);

  const loadStories = useCallback(async () => {
    if (!user?.id) return;
    setStoriesLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("stories")
        .select("id, media_url, created_at, archived_at")
        .eq("user_id", user.id)
        .eq("is_archived", true)
        .order("archived_at", { ascending: false });
      if (error) throw error;
      setStories((data ?? []).map((r: any) => ({
        id: String(r.id), media_url: r.media_url ?? null,
        created_at: r.created_at, archived_at: r.archived_at ?? null,
      })));
    } catch (e) {
      toast({ title: "Story Archive", description: getErrorMessage(e) });
    } finally { setStoriesLoading(false); }
  }, [user?.id]);

  const loadPosts = useCallback(async () => {
    if (!user?.id) return;
    setPostsLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("archived_posts")
        .select("post_id, archived_at")
        .eq("user_id", user.id)
        .order("archived_at", { ascending: false });
      if (error) throw error;
      const ids = (data ?? []).map((r: any) => String(r.post_id));
      const map = await fetchPostsByIds(ids);
      setPosts(ids.map((id) => map.get(id)).filter(Boolean) as SettingsPostItem[]);
    } catch (e) {
      toast({ title: "Post Archive", description: getErrorMessage(e) });
    } finally { setPostsLoading(false); }
  }, [user?.id]);

  const loadLive = useCallback(async () => {
    if (!user?.id) return;
    setLiveLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("live_sessions")
        .select("id, state, started_at, ended_at, created_at")
        .eq("author_id", user.id)
        .not("ended_at", "is", null)
        .order("ended_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      setLive((data ?? []).map((r: any) => ({
        id: String(r.id), state: String(r.state ?? "ended"),
        started_at: r.started_at ?? null, ended_at: r.ended_at ?? null, created_at: r.created_at,
      })));
    } catch (e) {
      toast({ title: "Live Sessions Archive", description: getErrorMessage(e) });
    } finally { setLiveLoading(false); }
  }, [user?.id]);

  if (currentScreen === "archive_stories") {
    return (
      <>
        <SettingsHeader title="Story Archive" isDark={isDark} currentScreen="archive_stories" onBack={onBack} onClose={onBack} />
        <div className="flex-1 overflow-y-auto native-scroll pb-8">
          <div className="px-4">
            <div className={cn("backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20")}>
              <div className="px-5 py-4">
                <p className="font-semibold">Archived Stories</p>
                <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>Source: stories table, where is_archived = true.</p>
              </div>
              {storiesLoading ? (
                <p className={cn("px-5 py-4 text-sm", isDark ? "text-white/60" : "text-white/70")}>Loading...</p>
              ) : stories.length === 0 ? (
                <p className={cn("px-5 py-4 text-sm", isDark ? "text-white/60" : "text-white/70")}>Story archive is empty.</p>
              ) : (
                <div className={cn("border-t", isDark ? "border-white/10" : "border-white/20")}>
                  {stories.map((s) => (
                    <div key={s.id} className={cn("px-5 py-4 border-b flex items-center gap-3", isDark ? "border-white/10" : "border-white/20")}>
                      <div className={cn("w-14 h-14 rounded-xl overflow-hidden border shrink-0", isDark ? "border-white/10" : "border-white/20")}>
                        {s.media_url
                          ? <img src={s.media_url} alt="story" className="w-full h-full object-cover" />
                          : <div className={cn("w-full h-full grid place-items-center text-xs", isDark ? "text-white/50" : "text-white/70")}>No media</div>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn("font-medium", isDark ? "text-white" : "text-white")}>Story #{s.id.slice(0, 8)}</p>
                        <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>
                          Archived: {s.archived_at ? new Date(s.archived_at).toLocaleDateString("ru-RU") : "-"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  if (currentScreen === "archive_posts") {
    return (
      <>
        <SettingsHeader title="Post Archive" isDark={isDark} currentScreen="archive_posts" onBack={onBack} onClose={onBack} />
        <div className="flex-1 overflow-y-auto native-scroll pb-8">
          <div className="px-4">
            <div className={cn("backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20")}>
              <div className="px-5 py-4">
                <p className="font-semibold">Archived Posts</p>
                <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>Source: archived_posts table.</p>
              </div>
              <SettingsPostsList rows={posts} loading={postsLoading} emptyText="Post archive is empty." isDark={isDark} />
            </div>
          </div>
        </div>
      </>
    );
  }

  if (currentScreen === "archive_live") {
    return (
      <>
        <SettingsHeader title="Live Sessions Archive" isDark={isDark} currentScreen="archive_live" onBack={onBack} onClose={onBack} />
        <div className="flex-1 overflow-y-auto native-scroll pb-8">
          <div className="px-4">
            <div className={cn("backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20")}>
              <div className="px-5 py-4">
                <p className="font-semibold">Past Live Streams</p>
                <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>Source: live_sessions (ended_at IS NOT NULL).</p>
              </div>
              {liveLoading ? (
                <p className={cn("px-5 py-4 text-sm", isDark ? "text-white/60" : "text-white/70")}>Loading...</p>
              ) : live.length === 0 ? (
                <p className={cn("px-5 py-4 text-sm", isDark ? "text-white/60" : "text-white/70")}>Live sessions archive is empty.</p>
              ) : (
                <div className={cn("border-t", isDark ? "border-white/10" : "border-white/20")}>
                  {live.map((s) => (
                    <div key={s.id} className={cn("px-5 py-4 border-b", isDark ? "border-white/10" : "border-white/20")}>
                      <p className={cn("font-medium", isDark ? "text-white" : "text-white")}>Live #{s.id.slice(0, 8)}</p>
                      <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>Status: {s.state}</p>
                      <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>
                        Ended: {s.ended_at ? new Date(s.ended_at).toLocaleString("ru-RU") : "-"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // "archive" main
  return (
    <>
      <SettingsHeader title="Archive" isDark={isDark} currentScreen="archive" onBack={onBack} onClose={onBack} />
      <div className="flex-1 overflow-y-auto native-scroll">
        <div className={cn("mx-4 backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20")}>
          <SettingsMenuItem
            icon={<Archive className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
            label="Story Archive"
            isDark={isDark}
            onClick={() => { onNavigate("archive_stories"); void loadStories(); }}
            value={stories.length ? String(stories.length) : undefined}
          />
          <SettingsMenuItem
            icon={<Archive className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
            label="Post Archive"
            isDark={isDark}
            onClick={() => { onNavigate("archive_posts"); void loadPosts(); }}
            value={posts.length ? String(posts.length) : undefined}
          />
          <SettingsMenuItem
            icon={<Archive className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
            label="Live Sessions Archive"
            isDark={isDark}
            onClick={() => { onNavigate("archive_live"); void loadLive(); }}
            value={live.length ? String(live.length) : undefined}
          />
        </div>
      </div>
    </>
  );
}
