/**
 * usePostLikes — paginated list of users who liked a post.
 *
 * Fetches from `post_likes` JOIN `profiles` with cursor-based pagination.
 * Returns a stable list that can be extended via `loadMore()`.
 *
 * Architecture:
 *   - postId null → no-op (sheet not open)
 *   - PAGE_SIZE = 30 — matches Instagram's batch size
 *   - Cursor pagination via `created_at` DESC + `id` tiebreaker
 *   - Deduplication guard: ignores duplicate loads
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dbLoose } from "@/lib/supabase";

const PAGE_SIZE = 30;

export interface PostLiker {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  likedAt: string;
}

interface UsePostLikesResult {
  likers: PostLiker[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  reset: () => void;
}

export function usePostLikes(postId: string | null): UsePostLikesResult {
  const [likers, setLikers] = useState<PostLiker[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cursor: { likedAt, id } of the last fetched row
  const cursorRef = useRef<{ likedAt: string; id: string } | null>(null);
  const fetchingRef = useRef(false);
  const currentPostIdRef = useRef<string | null>(null);

  const fetchPage = useCallback(
    async (isFirstPage: boolean) => {
      if (!postId) return;
      if (fetchingRef.current) return;
      fetchingRef.current = true;

      if (isFirstPage) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      try {
        // post_likes: { post_id, user_id, created_at }
        // profiles:   { id, username, display_name, avatar_url, is_verified }
        let query = dbLoose
          .from("post_likes")
          .select(
            `
            user_id,
            created_at,
            profiles:user_id (
              username,
              display_name,
              avatar_url,
              is_verified
            )
          `
          )
          .eq("post_id", postId)
          .order("created_at", { ascending: false })
          .order("user_id", { ascending: false })
          .limit(PAGE_SIZE);

        // Cursor pagination: fetch rows older than the last cursor
        if (!isFirstPage && cursorRef.current) {
          query = query.or(
            `created_at.lt.${cursorRef.current.likedAt},` +
              `and(created_at.eq.${cursorRef.current.likedAt},user_id.lt.${cursorRef.current.id})`
          );
        }

        const { data, error: fetchError } = await query;
        if (fetchError) throw fetchError;

        const rows = (data ?? []) as unknown as Array<{
          user_id: string;
          created_at: string;
          profiles: {
            username: string;
            display_name: string | null;
            avatar_url: string | null;
            is_verified: boolean | null;
          } | null;
        }>;

        const mapped: PostLiker[] = rows
          .filter((r) => r.profiles !== null)
          .map((r) => ({
            userId: r.user_id,
            username: r.profiles!.username,
            displayName: r.profiles!.display_name ?? r.profiles!.username,
            avatarUrl: r.profiles!.avatar_url,
            isVerified: r.profiles!.is_verified ?? false,
            likedAt: r.created_at,
          }));

        if (isFirstPage) {
          setLikers(mapped);
        } else {
          setLikers((prev) => [...prev, ...mapped]);
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
    [postId]
  );

  // Reset and fetch first page when postId changes
  useEffect(() => {
    if (postId === currentPostIdRef.current) return;
    currentPostIdRef.current = postId;
    cursorRef.current = null;
    setLikers([]);
    setHasMore(false);
    setError(null);
    if (postId) {
      void fetchPage(true);
    }
  }, [postId, fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    void fetchPage(false);
  }, [hasMore, loadingMore, loading, fetchPage]);

  const reset = useCallback(() => {
    cursorRef.current = null;
    currentPostIdRef.current = null;
    setLikers([]);
    setHasMore(false);
    setError(null);
  }, []);

  return { likers, loading, loadingMore, hasMore, error, loadMore, reset };
}
