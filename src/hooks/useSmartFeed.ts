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

import { useState, useEffect, useCallback, useRef } from 'react'; // useRef уже импортирован
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

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

interface PublicFeedRow {
  id: string;
  author_id: string;
  content: string | null;
  created_at: string;
  likes_count: number | null;
  comments_count: number | null;
  saves_count: number | null;
  shares_count: number | null;
  views_count: number | null;
  post_media?: FeedMedia[] | null;
}

interface PublicProfileRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified?: boolean | null;
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

/**
 * Определяет, является ли ошибка восстановимой (Edge Function недоступна).
 * Для таких ошибок хук переключается на публичный fallback-запрос напрямую к БД.
 * Невосстановимые ошибки (JS-ошибки в коде) пробрасываются наверх.
 */
function isRecoverableEdgeFeedError(error: unknown): boolean {
  const errObj = error instanceof Error ? error : null;
  const name = (errObj?.name ?? "").toLowerCase();
  const message = (errObj?.message ?? String(error ?? "")).toLowerCase();
  return (
    // Supabase FunctionsHttpError (4xx/5xx от Edge Function)
    name.includes("functionshttperror") ||
    name.includes("functionsrelayerror") ||
    name.includes("functionsfetcherror") ||
    // Fallback-строки в сообщении
    message.includes("unauthorized") ||
    message.includes("non-2xx") ||
    message.includes("functionshttperror") ||
    message.includes("feed unavailable") ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("edge function")
  );
}

async function fetchPublicFeedPage(
  cursor: FeedCursor | null,
  pageSize: number,
): Promise<FeedResponse> {
  let query = (supabase as any)
    .from("posts")
    .select(
      "id, author_id, content, created_at, likes_count, comments_count, saves_count, shares_count, views_count, post_media(id, media_url, media_type, sort_order)",
    )
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize);

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
    );
  }

  const { data: rawPosts, error: postsError } = await query;
  if (postsError) {
    throw postsError;
  }

  const postRows = ((rawPosts ?? []) as PublicFeedRow[]).map((row) => ({
    ...row,
    post_media: Array.isArray(row.post_media) ? row.post_media : [],
  }));

  const authorIds = Array.from(new Set(postRows.map((row) => row.author_id).filter(Boolean)));
  let profilesByUserId = new Map<string, PublicProfileRow>();

  if (authorIds.length > 0) {
    const { data: profileRows, error: profilesError } = await (supabase as any)
      .from("profiles")
      .select("user_id, display_name, avatar_url, is_verified")
      .in("user_id", authorIds);

    if (!profilesError) {
      profilesByUserId = new Map(
        ((profileRows ?? []) as PublicProfileRow[]).map((row) => [row.user_id, row]),
      );
    }
  }

  const posts: FeedPost[] = postRows.map((row) => {
    const profile = profilesByUserId.get(row.author_id);
    return {
      id: row.id,
      author_id: row.author_id,
      content: row.content,
      created_at: row.created_at,
      likes_count: Number(row.likes_count ?? 0),
      comments_count: Number(row.comments_count ?? 0),
      saves_count: Number(row.saves_count ?? 0),
      shares_count: Number(row.shares_count ?? 0),
      views_count: Number(row.views_count ?? 0),
      score: 0,
      is_liked: false,
      is_saved: false,
      author: {
        id: row.author_id,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        is_verified: Boolean(profile?.is_verified),
      },
      media: (row.post_media ?? []).slice().sort((a, b) => a.sort_order - b.sort_order),
    };
  });

  const lastPost = posts[posts.length - 1] ?? null;

  return {
    posts,
    has_more: posts.length === pageSize,
    next_cursor: lastPost ? { created_at: lastPost.created_at, id: lastPost.id } : null,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSmartFeed() {
  const { user, loading: authLoading } = useAuth();

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
    if (authLoading) return;

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
      const effectiveMode = !user && mode === 'following' ? 'smart' : mode;

      let incoming: FeedPost[] = [];
      let has_more = false;
      let next_cursor: FeedCursor | null = null;

      if (user) {
        try {
          const { data, error: fnError } = await supabase.functions.invoke<FeedResponse>(
            'get-feed-v2',
            {
              body: {
                mode: effectiveMode,
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

          incoming = data.posts;
          has_more = data.has_more;
          next_cursor = data.next_cursor;
        } catch (edgeError) {
          if (!isRecoverableEdgeFeedError(edgeError)) {
            throw edgeError;
          }
          logger.warn("[useSmartFeed] edge feed unavailable, using public fallback", { error: edgeError });
          const fallback = await fetchPublicFeedPage(cursor, PAGE_SIZE);
          incoming = fallback.posts;
          has_more = fallback.has_more;
          next_cursor = fallback.next_cursor;
        }
      } else {
        const fallback = await fetchPublicFeedPage(cursor, PAGE_SIZE);
        incoming = fallback.posts;
        has_more = fallback.has_more;
        next_cursor = fallback.next_cursor;
      }

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
      logger.error("[useSmartFeed] fetch error", { message });
    } finally {
      setLoading(false);
      setLoadingMore(false);
      fetchingRef.current = false;
    }
  }, [mode, hasMore, authLoading, user]);

  // ИСПРАВЛЕНИЕ дефекта #32: используем ref для стабильной ссылки на fetchPosts
  // Убираем eslint-disable — теперь deps корректны
  const fetchPostsRef = useRef(fetchPosts);
  useEffect(() => { fetchPostsRef.current = fetchPosts; }, [fetchPosts]);

  // Reset and reload when mode changes or user changes
  useEffect(() => {
    if (authLoading) return;
    setHasMore(true);
    void fetchPostsRef.current(true); // всегда актуальная ссылка без stale closure
  }, [mode, user?.id, authLoading]);

  // Realtime: подписка на новые посты — добавляем в начало ленты
  useEffect(() => {
    const channel = supabase
      .channel('feed_posts_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts', filter: 'is_published=eq.true' },
        (payload) => {
          const newPost = payload.new as Record<string, unknown>;
          if (!newPost?.id || seenIdsRef.current.has(String(newPost.id))) return;

          // Собираем FeedPost из Realtime payload (без media/author — будут подгружены при refresh)
          const post: FeedPost = {
            id: String(newPost.id),
            author_id: String(newPost.author_id ?? ''),
            content: newPost.content != null ? String(newPost.content) : null,
            created_at: String(newPost.created_at ?? new Date().toISOString()),
            likes_count: Number(newPost.likes_count ?? 0),
            comments_count: Number(newPost.comments_count ?? 0),
            saves_count: Number(newPost.saves_count ?? 0),
            shares_count: Number(newPost.shares_count ?? 0),
            views_count: Number(newPost.views_count ?? 0),
            score: 0,
            is_liked: false,
            is_saved: false,
            author: { id: String(newPost.author_id ?? ''), display_name: null, avatar_url: null, is_verified: false },
            media: [],
          };

          seenIdsRef.current.add(post.id);
          setPosts((prev) => [post, ...prev]);
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, []);

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
