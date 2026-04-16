/**
 * src/pages/settings/SettingsActivitySection.tsx
 * Screens: "activity" | "activity_likes" | "activity_comments" | "activity_reposts"
 */
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Heart, MessageCircle, Share2, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/utils";
import { getScreenTimeToday } from "@/lib/user-settings";
import { SettingsHeader, SettingsMenuItem, SettingsPostsList } from "./helpers";
import type { SectionProps, SettingsPostItem, ActivityCommentItem, ActivityRepostItem } from "./types";

type ActivityScreen = "activity" | "activity_likes" | "activity_comments" | "activity_reposts";

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

interface PostLikeRow {
  post_id: string;
  created_at: string;
}

interface CommentRow {
  id: string;
  post_id: string;
  content: string | null;
  created_at: string;
}

interface RepostRow {
  id: string;
  reel_id: string;
  created_at: string | null;
}

interface ReelRow {
  id: string;
  description: string | null;
  thumbnail_url: string | null;
}

interface ActivitySectionProps extends SectionProps { currentScreen: ActivityScreen; }

async function fetchPostsByIds(ids: string[]): Promise<Map<string, SettingsPostItem>> {
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from("posts")
    .select("id, content, created_at, likes_count, comments_count, post_media ( media_url, sort_order )")
    .in("id", ids);
  if (error) throw error;
  const map = new Map<string, SettingsPostItem>();
  for (const row of (data ?? []) as unknown as PostRow[]) {
    const media = Array.isArray(row.post_media) ? row.post_media : [];
    media.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    map.set(String(row.id), { id: String(row.id), content: row.content ?? null, created_at: row.created_at, likes_count: row.likes_count ?? 0, comments_count: row.comments_count ?? 0, media_url: media[0]?.media_url ?? null });
  }
  return map;
}

export function SettingsActivitySection({ isDark, currentScreen, onNavigate, onBack }: ActivitySectionProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [likes, setLikes] = useState<SettingsPostItem[]>([]);
  const [likesLoading, setLikesLoading] = useState(false);
  const [comments, setComments] = useState<ActivityCommentItem[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [reposts, setReposts] = useState<ActivityRepostItem[]>([]);
  const [repostsLoading, setRepostsLoading] = useState(false);
  const [screenTime, setScreenTime] = useState(0);
  const [screenTimeLoading, setScreenTimeLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const loadLikes = useCallback(async () => {
    if (!user?.id) return;
    setLikesLoading(true);
    try {
      const { data, error } = await supabase.from("post_likes").select("post_id, created_at").eq("user_id", user.id).order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as PostLikeRow[];
      const ids = rows.map((r) => String(r.post_id));
      const map = await fetchPostsByIds(ids);
      setLikes(ids.map((id) => map.get(id)).filter(Boolean) as SettingsPostItem[]);
    } catch (e) { toast({ title: "Лайки", description: getErrorMessage(e) }); }
    finally { setLikesLoading(false); }
  }, [user?.id]);

  const loadComments = useCallback(async () => {
    if (!user?.id) return;
    setCommentsLoading(true);
    try {
      const { data, error } = await supabase.from("comments").select("id, post_id, content, created_at").eq("author_id", user.id).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      const rows = (data ?? []) as unknown as CommentRow[];
      setComments(rows.map((r) => ({ id: String(r.id), post_id: String(r.post_id), content: String(r.content ?? ""), created_at: r.created_at })));
    } catch (e) { toast({ title: "Комментарии", description: getErrorMessage(e) }); }
    finally { setCommentsLoading(false); }
  }, [user?.id]);

  const loadReposts = useCallback(async () => {
    if (!user?.id) return;
    setRepostsLoading(true);
    try {
      const { data, error } = await supabase.from("reel_reposts").select("id, reel_id, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      const repostRows = (data ?? []) as unknown as RepostRow[];
      const reelIds = repostRows.map((r) => String(r.reel_id));
      const reelMap = new Map<string, ReelRow>();
      if (reelIds.length) {
        const { data: reelsData } = await supabase.from("reels").select("id, description, thumbnail_url").in("id", reelIds);
        const reels = (reelsData ?? []) as unknown as ReelRow[];
        for (const r of reels) reelMap.set(String(r.id), r);
      }
      setReposts(repostRows.map((r) => ({ id: String(r.id), reel_id: String(r.reel_id), created_at: r.created_at ?? null, reel_description: reelMap.get(String(r.reel_id))?.description ?? null, reel_thumbnail_url: reelMap.get(String(r.reel_id))?.thumbnail_url ?? null })));
    } catch (e) { toast({ title: "Репосты", description: getErrorMessage(e) }); }
    finally { setRepostsLoading(false); }
  }, [user?.id]);

  const exportData = useCallback(async () => {
    if (!user?.id) return;
    setExportLoading(true);
    try {
      const [l, c, r, s] = await Promise.all([
        supabase.from("post_likes").select("id, post_id, created_at").eq("user_id", user.id),
        supabase.from("comments").select("id, post_id, content, created_at").eq("author_id", user.id),
        supabase.from("reel_reposts").select("id, reel_id, created_at").eq("user_id", user.id),
        supabase.from("saved_posts").select("id, post_id, created_at").eq("user_id", user.id),
      ]);
      const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), user_id: user.id, likes: l.data ?? [], comments: c.data ?? [], reposts: r.data ?? [], saved_posts: s.data ?? [] }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `activity-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast({ title: "Готово", description: "Данные экспортированы." });
    } catch (e) { toast({ title: "Экспорт", description: getErrorMessage(e) }); }
    finally { setExportLoading(false); }
  }, [user?.id]);

  if (currentScreen === "activity_likes") {
    return (
      <>
        <SettingsHeader title="Лайки" isDark={isDark} currentScreen="activity_likes" onBack={onBack} onClose={onBack} />
        <div className="flex-1 pb-8">
          <div className="px-4">
            <div className={cn("backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20")}>
              <div className="px-5 py-4"><p className="font-semibold">Понравившиеся посты</p><p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>Посты, которым вы поставили лайк.</p></div>
              <SettingsPostsList rows={likes} loading={likesLoading} emptyText="Лайков пока нет." isDark={isDark} />
            </div>
          </div>
        </div>
      </>
    );
  }

  if (currentScreen === "activity_comments") {
    return (
      <>
        <SettingsHeader title="Комментарии" isDark={isDark} currentScreen="activity_comments" onBack={onBack} onClose={onBack} />
        <div className="flex-1 pb-8">
          <div className="px-4">
            <div className={cn("backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20")}>
              <div className="px-5 py-4"><p className="font-semibold">Ваши комментарии</p></div>
              {commentsLoading ? <p className={cn("px-5 py-4 text-sm", isDark ? "text-white/60" : "text-white/70")}>Загрузка…</p>
                : comments.length === 0 ? <p className={cn("px-5 py-4 text-sm", isDark ? "text-white/60" : "text-white/70")}>Комментариев пока нет.</p>
                : <div className={cn("border-t", isDark ? "border-white/10" : "border-white/20")}>
                    {comments.map((item) => (
                      <button key={item.id} onClick={() => navigate(`/post/${item.post_id}`)}
                        className={cn("w-full px-5 py-4 text-left border-b", isDark ? "border-white/10 hover:bg-white/5" : "border-white/20 hover:bg-muted/30")}>
                        <p className={cn("font-medium line-clamp-2", isDark ? "text-white" : "text-white")}>{item.content || "Комментарий без текста"}</p>
                        <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>{new Date(item.created_at).toLocaleString("ru-RU")}</p>
                      </button>
                    ))}
                  </div>}
            </div>
          </div>
        </div>
      </>
    );
  }

  if (currentScreen === "activity_reposts") {
    return (
      <>
        <SettingsHeader title="Репосты" isDark={isDark} currentScreen="activity_reposts" onBack={onBack} onClose={onBack} />
        <div className="flex-1 pb-8">
          <div className="px-4">
            <div className={cn("backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20")}>
              <div className="px-5 py-4"><p className="font-semibold">Репосты Reels</p></div>
              {repostsLoading ? <p className={cn("px-5 py-4 text-sm", isDark ? "text-white/60" : "text-white/70")}>Загрузка…</p>
                : reposts.length === 0 ? <p className={cn("px-5 py-4 text-sm", isDark ? "text-white/60" : "text-white/70")}>Репостов пока нет.</p>
                : <div className={cn("border-t", isDark ? "border-white/10" : "border-white/20")}>
                    {reposts.map((item) => (
                      <button key={item.id} onClick={() => navigate("/reels")}
                        className={cn("w-full px-5 py-4 text-left border-b flex items-center gap-3", isDark ? "border-white/10 hover:bg-white/5" : "border-white/20 hover:bg-muted/30")}>
                        <div className={cn("w-14 h-14 rounded-xl overflow-hidden border shrink-0", isDark ? "border-white/10" : "border-white/20")}>
                          {item.reel_thumbnail_url ? <img loading="lazy" src={item.reel_thumbnail_url} alt="reel" className="w-full h-full object-cover" />
                            : <div className={cn("w-full h-full grid place-items-center text-xs", isDark ? "text-white/50" : "text-white/70")}>Reel</div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={cn("font-medium truncate", isDark ? "text-white" : "text-white")}>{item.reel_description || `Reel #${item.reel_id.slice(0, 8)}`}</p>
                          <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>{item.created_at ? new Date(item.created_at).toLocaleString("ru-RU") : "-"}</p>
                        </div>
                      </button>
                    ))}
                  </div>}
            </div>
          </div>
        </div>
      </>
    );
  }

  // "activity" main
  return (
    <>
      <SettingsHeader title="Ваша активность" isDark={isDark} currentScreen="activity" onBack={onBack} onClose={onBack} />
      <div className="flex-1">
        <div className={cn("mx-4 backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20")}>
          <SettingsMenuItem icon={<Clock className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />} label="Время в приложении" isDark={isDark}
            onClick={() => {
              if (!screenTimeLoading) {
                setScreenTimeLoading(true);
                getScreenTimeToday()
                  .then((s) => setScreenTime(s))
                  .catch((error) => {
                    void error;
                    setScreenTime(0);
                  })
                  .finally(() => setScreenTimeLoading(false));
              }
            }}
            value={screenTimeLoading ? "..." : screenTime > 0 ? `${Math.floor(screenTime / 3600)}h ${Math.floor((screenTime % 3600) / 60)}m` : "0m"} />
          <SettingsMenuItem icon={<Heart className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />} label="Лайки" isDark={isDark}
            onClick={() => { onNavigate("activity_likes"); void loadLikes(); }} value={likes.length ? String(likes.length) : undefined} />
          <SettingsMenuItem icon={<MessageCircle className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />} label="Комментарии" isDark={isDark}
            onClick={() => { onNavigate("activity_comments"); void loadComments(); }} value={comments.length ? String(comments.length) : undefined} />
          <SettingsMenuItem icon={<Share2 className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />} label="Репосты" isDark={isDark}
            onClick={() => { onNavigate("activity_reposts"); void loadReposts(); }} value={reposts.length ? String(reposts.length) : undefined} />
          <SettingsMenuItem icon={<Download className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
            label={exportLoading ? "Скачивание…" : "Скачать данные"} isDark={isDark} onClick={() => { if (!exportLoading) void exportData(); }} />
        </div>
      </div>
    </>
  );
}
