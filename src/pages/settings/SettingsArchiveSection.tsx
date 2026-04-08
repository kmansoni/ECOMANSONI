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
import { listArchivedStories } from "@/lib/story-archive";
import { SettingsHeader, SettingsMenuItem, SettingsPostsList } from "./helpers";
import type { SectionProps, SettingsPostItem, SettingsStoryItem, SettingsLiveArchiveItem } from "./types";

interface PostMediaRow {
  media_url: string | null;
  sort_order: number | null;
}

interface PostRow {
  id: string;
  content: string | null;
  created_at: string;
  likes_count: number | null;
  comments_count: number | null;
  post_media: PostMediaRow[] | null;
}

interface ArchivedPostRefRow {
  post_id: string;
  archived_at: string;
}

interface LiveSessionArchiveRow {
  id: string;
  state: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

interface QueryResult<T> {
  data: T[] | null;
  error: unknown;
}

interface LiveSessionsQuery {
  eq(column: string, value: unknown): LiveSessionsQuery;
  not(column: string, operator: string, value: unknown): LiveSessionsQuery;
  order(column: string, options: { ascending: boolean }): LiveSessionsQuery;
  limit(count: number): Promise<QueryResult<LiveSessionArchiveRow>>;
}

interface LightweightArchiveClient {
  from(table: "live_sessions"): { select(columns: string): LiveSessionsQuery };
}

async function fetchPostsByIds(postIds: string[]): Promise<Map<string, SettingsPostItem>> {
  if (!postIds.length) return new Map();
  const { data, error } = await supabase
    .from("posts")
    .select("id, content, created_at, likes_count, comments_count, post_media ( media_url, sort_order )")
    .in("id", postIds);
  if (error) throw error;
  const map = new Map<string, SettingsPostItem>();
  for (const row of (data ?? []) as unknown as PostRow[]) {
    const media = Array.isArray(row.post_media) ? row.post_media : [];
    media.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
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
      const rows = await listArchivedStories(user.id);
      setStories(rows.map((row) => {
        return {
          id: String(row.story_id),
          media_url: row.media_url ?? null,
          created_at: row.created_at,
          archived_at: row.archived_at ?? null,
        };
      }));
    } catch (e) {
      toast({ title: "Архив историй", description: getErrorMessage(e) });
    } finally { setStoriesLoading(false); }
  }, [user?.id]);

  const loadPosts = useCallback(async () => {
    if (!user?.id) return;
    setPostsLoading(true);
    try {
      const { data, error } = await supabase
        .from("archived_posts")
        .select("post_id, archived_at")
        .eq("user_id", user.id)
        .order("archived_at", { ascending: false });
      if (error) throw error;
      const refs = (data ?? []) as unknown as ArchivedPostRefRow[];
      const ids = refs.map((r) => String(r.post_id));
      const map = await fetchPostsByIds(ids);
      setPosts(ids.map((id) => map.get(id)).filter(Boolean) as SettingsPostItem[]);
    } catch (e) {
      toast({ title: "Архив постов", description: getErrorMessage(e) });
    } finally { setPostsLoading(false); }
  }, [user?.id]);

  const loadLive = useCallback(async () => {
    if (!user?.id) return;
    setLiveLoading(true);
    try {
      const archiveClient = supabase as unknown as LightweightArchiveClient;
      const { data, error } = await archiveClient
        .from("live_sessions")
        .select("id, state, started_at, ended_at, created_at")
        .eq("author_id", user.id)
        .not("ended_at", "is", null)
        .order("ended_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const rows = data ?? [];
      setLive(rows.map((r) => ({
        id: String(r.id), state: String(r.state ?? "ended"),
        started_at: r.started_at ?? null, ended_at: r.ended_at ?? null, created_at: r.created_at,
      })));
    } catch (e) {
      toast({ title: "Архив трансляций", description: getErrorMessage(e) });
    } finally { setLiveLoading(false); }
  }, [user?.id]);

  if (currentScreen === "archive_stories") {
    return (
      <>
        <SettingsHeader title="Архив историй" isDark={isDark} currentScreen="archive_stories" onBack={onBack} onClose={onBack} />
        <div className="flex-1 pb-8">
          <div className="px-4">
            <div className={cn("backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20")}>
              <div className="px-5 py-4">
                <p className="font-semibold">Архивированные истории</p>
                <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>Истории, которые были архивированы автоматически.</p>
              </div>
              {storiesLoading ? (
                <p className={cn("px-5 py-4 text-sm", isDark ? "text-white/60" : "text-white/70")}>Загрузка…</p>
              ) : stories.length === 0 ? (
                <p className={cn("px-5 py-4 text-sm", isDark ? "text-white/60" : "text-white/70")}>Архив историй пуст.</p>
              ) : (
                <div className={cn("border-t", isDark ? "border-white/10" : "border-white/20")}>
                  {stories.map((s) => (
                    <div key={s.id} className={cn("px-5 py-4 border-b flex items-center gap-3", isDark ? "border-white/10" : "border-white/20")}>
                      <div className={cn("w-14 h-14 rounded-xl overflow-hidden border shrink-0", isDark ? "border-white/10" : "border-white/20")}>
                        {s.media_url
                          ? <img src={s.media_url} alt="story" className="w-full h-full object-cover" />
                          : <div className={cn("w-full h-full grid place-items-center text-xs", isDark ? "text-white/50" : "text-white/70")}>Нет медиа</div>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn("font-medium", isDark ? "text-white" : "text-white")}>Story #{s.id.slice(0, 8)}</p>
                        <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>
                          Архивировано: {s.archived_at ? new Date(s.archived_at).toLocaleDateString("ru-RU") : "-"}
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
        <SettingsHeader title="Архив постов" isDark={isDark} currentScreen="archive_posts" onBack={onBack} onClose={onBack} />
        <div className="flex-1 pb-8">
          <div className="px-4">
            <div className={cn("backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20")}>
              <div className="px-5 py-4">
                <p className="font-semibold">Архивированные посты</p>
                <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>Посты, которые вы переместили в архив.</p>
              </div>
              <SettingsPostsList rows={posts} loading={postsLoading} emptyText="Архив постов пуст." isDark={isDark} />
            </div>
          </div>
        </div>
      </>
    );
  }

  if (currentScreen === "archive_live") {
    return (
      <>
        <SettingsHeader title="Архив трансляций" isDark={isDark} currentScreen="archive_live" onBack={onBack} onClose={onBack} />
        <div className="flex-1 pb-8">
          <div className="px-4">
            <div className={cn("backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20")}>
              <div className="px-5 py-4">
                <p className="font-semibold">Завершённые трансляции</p>
                <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>Ваши прошедшие прямые эфиры.</p>
              </div>
              {liveLoading ? (
                <p className={cn("px-5 py-4 text-sm", isDark ? "text-white/60" : "text-white/70")}>Загрузка…</p>
              ) : live.length === 0 ? (
                <p className={cn("px-5 py-4 text-sm", isDark ? "text-white/60" : "text-white/70")}>Архив трансляций пуст.</p>
              ) : (
                <div className={cn("border-t", isDark ? "border-white/10" : "border-white/20")}>
                  {live.map((s) => (
                    <div key={s.id} className={cn("px-5 py-4 border-b", isDark ? "border-white/10" : "border-white/20")}>
                      <p className={cn("font-medium", isDark ? "text-white" : "text-white")}>Live #{s.id.slice(0, 8)}</p>
                      <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>Статус: {s.state}</p>
                      <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>
                        Завершено: {s.ended_at ? new Date(s.ended_at).toLocaleString("ru-RU") : "-"}
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
      <SettingsHeader title="Архив" isDark={isDark} currentScreen="archive" onBack={onBack} onClose={onBack} />
      <div className="flex-1">
        <div className={cn("mx-4 backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20")}>
          <SettingsMenuItem
            icon={<Archive className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
            label="Архив историй"
            isDark={isDark}
            onClick={() => { onNavigate("archive_stories"); void loadStories(); }}
            value={stories.length ? String(stories.length) : undefined}
          />
          <SettingsMenuItem
            icon={<Archive className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
            label="Архив постов"
            isDark={isDark}
            onClick={() => { onNavigate("archive_posts"); void loadPosts(); }}
            value={posts.length ? String(posts.length) : undefined}
          />
          <SettingsMenuItem
            icon={<Archive className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
            label="Архив трансляций"
            isDark={isDark}
            onClick={() => { onNavigate("archive_live"); void loadLive(); }}
            value={live.length ? String(live.length) : undefined}
          />
        </div>
      </div>
    </>
  );
}
