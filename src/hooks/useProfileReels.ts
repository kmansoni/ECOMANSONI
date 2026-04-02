import { useState, useEffect, useRef, useCallback } from "react";
import { dbLoose } from "@/lib/supabase";
import { normalizeReelMediaUrl } from "@/lib/reels/media";
import { logger } from "@/lib/logger";

export interface ProfileReel {
  id: string;
  video_url: string;
  thumbnail_url: string | null;
  views_count: number;
  likes_count: number;
  created_at: string;
}

type ReelRpcRow = {
  id?: string | number;
  video_url?: string | null;
  thumbnail_url?: string | null;
  views_count?: string | number | null;
  likes_count?: string | number | null;
  created_at?: string | null;
};

const PAGE_SIZE = 30;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export function useProfileReels(userId: string | undefined) {
  const [myReels, setMyReels] = useState<ProfileReel[]>([]);
  const [myReelsLoading, setMyReelsLoading] = useState(false);
  const [myReelsHasMore, setMyReelsHasMore] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const loadMyReels = useCallback(async (opts?: { reset?: boolean }) => {
    if (!userId) return;
    const reset = Boolean(opts?.reset);
    if (!reset && !myReelsHasMore) return;

    // Отменяем предыдущий запрос (race condition guard)
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setMyReelsLoading(true);
    try {
      const offset = reset ? 0 : myReels.length;
      const { data, error } = await dbLoose.rpc("get_user_reels_v1", {
        p_author_id: userId,
        p_limit: PAGE_SIZE,
        p_offset: offset,
      });

      if (controller.signal.aborted) return;
      if (error) throw error;

      const reelRows = Array.isArray(data) ? (data as unknown as ReelRpcRow[]) : [];
      const rows: ProfileReel[] = reelRows.map(r => ({
        id: String(r.id ?? ""),
        video_url: normalizeReelMediaUrl(r.video_url ?? null, "reels-media"),
        thumbnail_url: normalizeReelMediaUrl(r.thumbnail_url ?? null, "reels-media") || r.thumbnail_url || null,
        views_count: Number(r.views_count ?? 0),
        likes_count: Number(r.likes_count ?? 0),
        created_at: String(r.created_at ?? ""),
      }));

      setMyReels(prev => reset ? rows : [...prev, ...rows]);
      setMyReelsHasMore(rows.length >= PAGE_SIZE);
    } catch (err) {
      if (!isAbortError(err)) {
        logger.warn("profile.load_my_reels_failed", { error: err, userId, reset });
      }
    } finally {
      if (!controller.signal.aborted) setMyReelsLoading(false);
    }
  }, [userId, myReelsHasMore, myReels.length]);

  // Ресет при смене профиля
  useEffect(() => {
    setMyReels([]);
    setMyReelsHasMore(true);
    abortRef.current?.abort();
  }, [userId]);

  // Cleanup при unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { myReels, myReelsLoading, myReelsHasMore, loadMyReels };
}
