/**
 * Shared post loader for Settings screens (archive, saved, liked).
 */
import { supabase } from "@/integrations/supabase/client";
import type { SettingsPostItem } from "./types";

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

export async function fetchPostsByIds(postIds: string[]): Promise<Map<string, SettingsPostItem>> {
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
