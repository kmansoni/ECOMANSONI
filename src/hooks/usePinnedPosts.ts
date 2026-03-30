import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

export interface PinnedPostRecord {
  id: string;
  post_id: string;
  position: number;
  pinned_at?: string;
  post?: {
    id: string;
    media_url: string;
    media_type: string;
    thumbnail_url?: string;
  };
}

interface RawPinnedPost {
  id: string;
  post_id: string;
  position: number | null;
  pinned_at?: string;
}

interface RawMediaRow {
  post_id: string;
  media_url: string;
  media_type: string;
}

export function usePinnedPosts(userId?: string) {
  const { user } = useAuth();
  const targetUserId = userId ?? user?.id;

  const [pinnedPosts, setPinnedPosts] = useState<PinnedPostRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!targetUserId) {
      setPinnedPosts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: pinnedRows, error: pinnedError } = await (supabase as any)
        .from("pinned_posts")
        .select("id, post_id, position, pinned_at")
        .eq("user_id", targetUserId)
        .order("position", { ascending: true })
        .order("pinned_at", { ascending: true });

      if (pinnedError) {
        throw pinnedError;
      }

      const rows = (pinnedRows ?? []) as RawPinnedPost[];
      const postIds = rows.map((row) => row.post_id).filter(Boolean);

      if (postIds.length === 0) {
        setPinnedPosts([]);
        return;
      }

      const { data: postsData, error: postsError } = await (supabase as any)
        .from("posts")
        .select("id")
        .eq("is_published", true)
        .in("id", postIds);

      if (postsError) {
        throw postsError;
      }

      const visiblePostIds = new Set(((postsData ?? []) as Array<{ id: string }>).map((post) => String(post.id)));

      const { data: mediaRows, error: mediaError } = await (supabase as any)
        .from("post_media")
        .select("post_id, media_url, media_type")
        .in("post_id", postIds)
        .order("sort_order", { ascending: true });

      if (mediaError) {
        throw mediaError;
      }

      const firstMediaByPostId = new Map<string, RawMediaRow>();
      for (const media of (mediaRows ?? []) as RawMediaRow[]) {
        const postId = String(media.post_id || "");
        if (!postId || firstMediaByPostId.has(postId)) continue;
        firstMediaByPostId.set(postId, media);
      }

      const mapped = rows
        .filter((row) => visiblePostIds.has(String(row.post_id)))
        .map((row) => {
          const media = firstMediaByPostId.get(String(row.post_id));
          return {
            id: row.id,
            post_id: row.post_id,
            position: Number(row.position ?? 0),
            pinned_at: row.pinned_at,
            post: media
              ? {
                  id: row.post_id,
                  media_url: media.media_url,
                  media_type: media.media_type,
                }
              : undefined,
          } satisfies PinnedPostRecord;
        });

      setPinnedPosts(mapped);
    } catch (error) {
      logger.error("[usePinnedPosts] Failed to load pinned posts", { error });
      setPinnedPosts([]);
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pinnedPostIds = useMemo(() => new Set(pinnedPosts.map((item) => item.post_id)), [pinnedPosts]);
  const pinnedPositions = useMemo(
    () => new Map(pinnedPosts.map((item) => [item.post_id, item.position])),
    [pinnedPosts],
  );

  const pinPost = useCallback(
    async (postId: string) => {
      if (!user?.id || user.id !== targetUserId) {
        toast.error("Закреплять посты может только владелец профиля");
        return false;
      }

      if (pinnedPostIds.has(postId)) {
        toast.error("Пост уже закреплён");
        return false;
      }

      if (pinnedPosts.length >= 3) {
        toast.error("Можно закрепить максимум 3 поста");
        return false;
      }

      const nextPosition = pinnedPosts.reduce((max, item) => Math.max(max, Number(item.position ?? 0)), -1) + 1;
      const { error } = await (supabase as any).from("pinned_posts").insert({
        user_id: user.id,
        post_id: postId,
        position: nextPosition,
      });

      if (error) {
        toast.error("Не удалось закрепить пост");
        return false;
      }

      await refresh();
      toast.success("Пост закреплён");
      return true;
    },
    [pinnedPostIds, pinnedPosts, refresh, targetUserId, user?.id],
  );

  const unpinPost = useCallback(
    async (pinnedId: string) => {
      if (!user?.id || user.id !== targetUserId) {
        toast.error("Откреплять посты может только владелец профиля");
        return false;
      }

      const { error } = await (supabase as any)
        .from("pinned_posts")
        .delete()
        .eq("id", pinnedId)
        .eq("user_id", user.id);

      if (error) {
        toast.error("Не удалось открепить пост");
        return false;
      }

      await refresh();
      toast.success("Пост откреплён");
      return true;
    },
    [refresh, targetUserId, user?.id],
  );

  return {
    pinnedPosts,
    pinnedPostIds,
    pinnedPositions,
    loading,
    refresh,
    pinPost,
    unpinPost,
  };
}