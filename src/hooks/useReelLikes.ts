import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dbLoose } from "@/lib/supabase";

const PAGE_SIZE = 30;

export interface ReelLiker {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  likedAt: string;
}

interface UseReelLikesResult {
  likers: ReelLiker[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  reset: () => void;
}

export function useReelLikes(reelId: string | null): UseReelLikesResult {
  const [likers, setLikers] = useState<ReelLiker[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cursorRef = useRef<{ likedAt: string; id: string } | null>(null);
  const fetchingRef = useRef(false);
  const currentReelIdRef = useRef<string | null>(null);

  const fetchPage = useCallback(
    async (isFirstPage: boolean) => {
      if (!reelId) return;
      if (fetchingRef.current) return;
      fetchingRef.current = true;

      if (isFirstPage) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      try {
        let query = dbLoose
          .from("reel_likes")
          .select("user_id, created_at")
          .eq("reel_id", reelId)
          .order("created_at", { ascending: false })
          .order("user_id", { ascending: false })
          .limit(PAGE_SIZE);

        if (!isFirstPage && cursorRef.current) {
          query = query.or(
            `created_at.lt.${cursorRef.current.likedAt},` +
              `and(created_at.eq.${cursorRef.current.likedAt},user_id.lt.${cursorRef.current.id})`
          );
        }

        const { data: likesData, error: likesError } = await query;
        if (likesError) throw likesError;

        const rows = (likesData ?? []) as Array<{ user_id: string; created_at: string }>;
        if (rows.length === 0) {
          if (isFirstPage) setLikers([]);
          setHasMore(false);
          return;
        }

        const userIds = rows.map(r => r.user_id);
        const { data: profilesData, error: profilesError } = await dbLoose
          .from("profiles")
          .select("user_id, username, display_name, avatar_url, verified")
          .in("user_id", userIds);
        if (profilesError) throw profilesError;

        type ProfileRow = {
          user_id: string;
          username: string | null;
          display_name: string | null;
          avatar_url: string | null;
          verified: boolean | null;
        };
        const profileMap = new Map<string, ProfileRow>();
        for (const p of (profilesData ?? []) as ProfileRow[]) {
          profileMap.set(p.user_id, p);
        }

        const mapped: ReelLiker[] = rows
          .filter(r => profileMap.has(r.user_id))
          .map(r => {
            const p = profileMap.get(r.user_id)!;
            return {
              userId: r.user_id,
              username: p.username ?? `u_${r.user_id.slice(0, 8)}`,
              displayName: p.display_name ?? p.username ?? "Пользователь",
              avatarUrl: p.avatar_url,
              isVerified: p.verified ?? false,
              likedAt: r.created_at,
            };
          });

        if (isFirstPage) {
          setLikers(mapped);
        } else {
          setLikers(prev => [...prev, ...mapped]);
        }

        setHasMore(rows.length === PAGE_SIZE);

        if (rows.length > 0) {
          const last = rows[rows.length - 1];
          cursorRef.current = { likedAt: last.created_at, id: last.user_id };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Ошибка загрузки";
        setError(msg);
      } finally {
        fetchingRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [reelId]
  );

  useEffect(() => {
    if (reelId === currentReelIdRef.current) return;
    currentReelIdRef.current = reelId;
    cursorRef.current = null;
    setLikers([]);
    setHasMore(false);
    setError(null);
    if (reelId) {
      void fetchPage(true);
    }
  }, [reelId, fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    void fetchPage(false);
  }, [hasMore, loadingMore, loading, fetchPage]);

  const reset = useCallback(() => {
    cursorRef.current = null;
    currentReelIdRef.current = null;
    setLikers([]);
    setHasMore(false);
    setError(null);
  }, []);

  return { likers, loading, loadingMore, hasMore, error, loadMore, reset };
}
