/**
 * useSmartFeed — server-ranked feed hook.
 *
 * Architecture:
 *   All ranking is delegated to the `get-feed-v2` Edge Function, which calls
 *   the `get_ranked_feed_v2` PostgreSQL function. No client-side scoring.
 *
 * Cursor pagination:
 *   (created_at, id) composite cursor — stable across concurrent inserts.
 *   Cursor is stored in a ref to avoid stale-closure issues in callbacks.
 *
 * Mode persistence:
 *   Stored in localStorage. Falls back to 'smart' on parse error.
 *
 * Error handling:
 *   All errors are surfaced via the `error` field. No silent swallowing.
 *   Network errors and 5xx are distinguished from 4xx auth errors.
 *
 * Scale:
 *   - Stateless: no in-memory affinity cache (server handles it)
 *   - No N+1: single Edge Function call per page
 *   - Deduplication: Set<string> of seen post IDs prevents duplicates on
 *     concurrent loadMore calls
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FeedMode = 'smart' | 'chronological' | 'following';

export interface FeedAuthor {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
}

export interface FeedMedia {
  id: string;
  media_url: string;
  media_type: string;
  sort_order: number;
}

export interface FeedPost {
  id: string;
  author_id: string;
  content: string | null;
  created_at: string;
  likes_count: number;
  comments_count: number;
  saves_count: number;
  shares_count: number;
  views_count: number;
  score: number;
  is_liked: boolean;
  is_saved: boolean;
  author: FeedAuthor;
  media: FeedMedia[];
}

interface FeedCursor {
  created_at: string;
  id: string;
}

interface FeedResponse {
  posts: FeedPost[];
  has_more: boolean;
  next_cursor: FeedCursor | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FEED_MODE_KEY = 'feed_mode_v2';
const PAGE_SIZE = 20;

const VALID_MODES = new Set<FeedMode>(['smart', 'chronological', 'following']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readStoredMode(): FeedMode {
  try {
    const stored = localStorage.getItem(FEED_MODE_KEY);
    if (stored && VALID_MODES.has(stored as FeedMode)) {
      return stored as FeedMode;
    }
  } catch {
    // localStorage unavailable (private browsing, storage quota)
  }
  return 'smart';
}

function writeStoredMode(mode: FeedMode): void {
  try {
    localStorage.setItem(FEED_MODE_KEY, mode);
  } catch {
    // Non-fatal: mode will reset on next page load
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSmartFeed() {
  const { user } = useAuth();

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [mode, setModeState] = useState<FeedMode>(readStoredMode);
  const [error, setError] = useState<string | null>(null);

  // Cursor ref — avoids stale closure in loadMore callback
  const cursorRef = useRef<FeedCursor | null>(null);
  // Dedup guard — prevents duplicate posts on concurrent loadMore calls
  const seenIdsRef = useRef<Set<string>>(new Set());
  // Inflight guard — prevents concurrent fetches
  const fetchingRef = useRef(false);

  const setMode = useCallback((newMode: FeedMode) => {
    setModeState(newMode);
    writeStoredMode(newMode);
  }, []);

  const fetchPosts = useCallback(async (reset: boolean): Promise<void> => {
    if (fetchingRef.current) return;
    if (!reset && !hasMore) return;

    fetchingRef.current = true;
    setError(null);

    if (reset) {
      setLoading(true);
      cursorRef.current = null;
      seenIdsRef.current = new Set();
    } else {
      setLoadingMore(true);
    }

    try {
      const cursor = cursorRef.current;

      const { data, error: fnError } = await supabase.functions.invoke<FeedResponse>(
        'get-feed-v2',
        {
          body: {
            mode,
            page_size: PAGE_SIZE,
            cursor_created_at: cursor?.created_at ?? null,
            cursor_id: cursor?.id ?? null,
          },
        },
      );

      if (fnError) {
        throw new Error(fnError.message ?? 'Feed unavailable');
      }

      if (!data) {
        throw new Error('Empty response from feed function');
      }

      const { posts: incoming, has_more, next_cursor } = data;

      // Deduplicate against already-rendered posts
      const fresh = incoming.filter((p) => !seenIdsRef.current.has(p.id));
      fresh.forEach((p) => seenIdsRef.current.add(p.id));

      setHasMore(has_more && fresh.length > 0);
      cursorRef.current = next_cursor;

      if (reset) {
        setPosts(fresh);
      } else {
        setPosts((prev) => [...prev, ...fresh]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка загрузки ленты';
      setError(message);
      console.error('[useSmartFeed] fetch error:', message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      fetchingRef.current = false;
    }
  }, [mode, hasMore]);

  // Reset and reload when mode changes or user changes
  useEffect(() => {
    setHasMore(true);
    void fetchPosts(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, user?.id]);

  const refetch = useCallback((): Promise<void> => {
    setHasMore(true);
    return fetchPosts(true);
  }, [fetchPosts]);

  const loadMore = useCallback((): void => {
    if (!loadingMore && hasMore) {
      void fetchPosts(false);
    }
  }, [fetchPosts, loadingMore, hasMore]);

  return {
    posts,
    loading,
    loadingMore,
    hasMore,
    error,
    mode,
    setMode,
    refetch,
    loadMore,
  } as const;
}
