/**
 * src/pages/settings/SettingsSavedSection.tsx
 * Screens: "saved" | "saved_all_posts" | "saved_liked_posts"
 * Self-contained: manages its own loading state and data fetching.
 */
import { useCallback, useEffect, useState } from "react";
import { Bookmark, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/utils";
import { SettingsHeader, SettingsMenuItem, SettingsPostsList } from "./helpers";
import type { SectionProps, SettingsPostItem } from "./types";

// ——— Internal helpers ———————————————————————————————————————————————————

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

interface SavedPostRefRow {
  post_id: string;
  created_at: string;
}

interface PostLikeRefRow {
  post_id: string;
  created_at: string;
}

interface CountOnlyRow {
  post_id: string;
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

// ——— Sub-screens ———————————————————————————————————————————————————————

interface SubProps {
  isDark: boolean;
  onBack: () => void;
}

function SavedAllPostsScreen({ isDark, onBack }: SubProps) {
  const { user } = useAuth();
  const [posts, setPosts] = useState<SettingsPostItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("saved_posts")
          .select("post_id, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        const refs = (data ?? []) as unknown as SavedPostRefRow[];
        const ids = refs.map((r) => String(r.post_id));
        const map = await fetchPostsByIds(ids);
        setPosts(ids.map((id) => map.get(id)).filter(Boolean) as SettingsPostItem[]);
      } catch (e) {
        toast({ title: "Saved", description: getErrorMessage(e) });
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  return (
    <>
      <SettingsHeader title="All Posts" isDark={isDark} currentScreen="saved_all_posts" onBack={onBack} onClose={onBack} />
      <div className="flex-1 overflow-y-auto native-scroll pb-8">
        <div className="px-4">
          <div className={cn("backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20")}>
            <div className="px-5 py-4">
              <p className="font-semibold">Saved Posts</p>
              <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                Source: saved_posts table.
              </p>
            </div>
            <SettingsPostsList rows={posts} loading={loading} emptyText="You have no saved posts yet." isDark={isDark} />
          </div>
        </div>
      </div>
    </>
  );
}

function SavedLikedPostsScreen({ isDark, onBack }: SubProps) {
  const { user } = useAuth();
  const [posts, setPosts] = useState<SettingsPostItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("post_likes")
          .select("post_id, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        const refs = (data ?? []) as unknown as PostLikeRefRow[];
        const ids = refs.map((r) => String(r.post_id));
        const map = await fetchPostsByIds(ids);
        setPosts(ids.map((id) => map.get(id)).filter(Boolean) as SettingsPostItem[]);
      } catch (e) {
        toast({ title: "Liked Posts", description: getErrorMessage(e) });
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  return (
    <>
      <SettingsHeader title="Liked Posts" isDark={isDark} currentScreen="saved_liked_posts" onBack={onBack} onClose={onBack} />
      <div className="flex-1 overflow-y-auto native-scroll pb-8">
        <div className="px-4">
          <div className={cn("backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20")}>
            <div className="px-5 py-4">
              <p className="font-semibold">Liked Posts</p>
              <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                Source: post_likes table.
              </p>
            </div>
            <SettingsPostsList rows={posts} loading={loading} emptyText="You have no liked posts yet." isDark={isDark} />
          </div>
        </div>
      </div>
    </>
  );
}

// ——— Public section component ————————————————————————————————————————————

type SavedScreen = "saved" | "saved_all_posts" | "saved_liked_posts";

interface SavedSectionProps extends SectionProps {
  currentScreen: SavedScreen;
}

export function SettingsSavedSection({ isDark, currentScreen, onNavigate, onBack }: SavedSectionProps) {
  const { user } = useAuth();
  const [savedAllPosts, setSavedAllPosts] = useState<SettingsPostItem[]>([]);
  const [savedLikedPosts, setSavedLikedPosts] = useState<SettingsPostItem[]>([]);

  const loadCounts = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [savedRes, likedRes] = await Promise.all([
        supabase.from("saved_posts").select("post_id").eq("user_id", user.id),
        supabase.from("post_likes").select("post_id").eq("user_id", user.id),
      ]);
      const savedRows = (savedRes.data ?? []) as unknown as CountOnlyRow[];
      const likedRows = (likedRes.data ?? []) as unknown as CountOnlyRow[];
      setSavedAllPosts(savedRows.map((r) => ({ id: r.post_id } as SettingsPostItem)));
      setSavedLikedPosts(likedRows.map((r) => ({ id: r.post_id } as SettingsPostItem)));
    } catch (error) {
      void error;
    }
  }, [user?.id]);

  useEffect(() => {
    if (currentScreen === "saved") void loadCounts();
  }, [currentScreen, loadCounts]);

  if (currentScreen === "saved_all_posts") {
    return <SavedAllPostsScreen isDark={isDark} onBack={onBack} />;
  }
  if (currentScreen === "saved_liked_posts") {
    return <SavedLikedPostsScreen isDark={isDark} onBack={onBack} />;
  }

  return (
    <>
      <SettingsHeader title="Saved" isDark={isDark} currentScreen="saved" onBack={onBack} onClose={onBack} />
      <div className="flex-1 overflow-y-auto native-scroll">
        <div className={cn("mx-4 backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20")}>
          <SettingsMenuItem
            icon={<Bookmark className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
            label="All Posts"
            isDark={isDark}
            onClick={() => onNavigate("saved_all_posts")}
            value={savedAllPosts.length ? String(savedAllPosts.length) : undefined}
          />
          <SettingsMenuItem
            icon={<Heart className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
            label="Liked Posts"
            isDark={isDark}
            onClick={() => onNavigate("saved_liked_posts")}
            value={savedLikedPosts.length ? String(savedLikedPosts.length) : undefined}
          />
        </div>
        <p className={cn("p-5 text-center text-sm", isDark ? "text-white/60" : "text-white/60")}>
          Create collections to organize saved posts
        </p>
      </div>
    </>
  );
}
