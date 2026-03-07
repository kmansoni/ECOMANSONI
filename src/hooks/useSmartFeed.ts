import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Post } from '@/hooks/usePosts.tsx';
import {
  calculateFeedScore,
  applyRecencyDecay,
  calculateEngagementRate,
  diversityPenalty,
  rankFeedItems,
  calculateAuthorAffinity,
  calculateContentRelevance,
} from '@/lib/feed/smartFeedAlgorithm';

export type FeedMode = 'smart' | 'chronological' | 'following';

export interface ScoredPost extends Post {
  score: number;
}

const FEED_MODE_KEY = 'feed_mode';
const PAGE_SIZE = 20;

type FeedCursor = {
  createdAt: string;
  id: string;
};

function getStoredFeedMode(): FeedMode {
  try {
    const stored = localStorage.getItem(FEED_MODE_KEY);
    if (stored === 'smart' || stored === 'chronological' || stored === 'following') {
      return stored;
    }
  } catch {
    // ignore
  }
  return 'smart';
}

export function useSmartFeed() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<ScoredPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [mode, setModeState] = useState<FeedMode>(getStoredFeedMode);
  const [error, setError] = useState<string | null>(null);

  const cursorRef = useRef<FeedCursor | null>(null);
  const authorAffinityCache = useRef<Map<string, number>>(new Map());
  const userInterestsCache = useRef<Map<string, number>>(new Map());

  const setMode = useCallback((newMode: FeedMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem(FEED_MODE_KEY, newMode);
    } catch {
      // ignore
    }
  }, []);

  // Загружаем affinity данные пользователя
  const loadUserAffinity = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await (supabase as any)
        .from('user_author_affinity')
        .select('author_id, affinity_score')
        .eq('user_id', user.id);

      if (data) {
        const map = new Map<string, number>();
        data.forEach((row: { author_id: string; affinity_score: number }) => {
          map.set(row.author_id, row.affinity_score);
        });
        authorAffinityCache.current = map;
      }
    } catch {
      // ignore — таблица может не существовать
    }
  }, [user]);

  // Загружаем интересы пользователя
  const loadUserInterests = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await (supabase as any)
        .from('user_interests')
        .select('interest_tag, weight')
        .eq('user_id', user.id);

      if (data) {
        const map = new Map<string, number>();
        data.forEach((row: { interest_tag: string; weight: number }) => {
          map.set(row.interest_tag, row.weight);
        });
        userInterestsCache.current = map;
      }
    } catch {
      // ignore
    }
  }, [user]);

  const fetchPosts = useCallback(async (reset = false) => {
    if (!reset && !hasMore) return;

    try {
      // Clear stale error before each load attempt.
      setError(null);

      if (reset) {
        setLoading(true);
        cursorRef.current = null;
      } else {
        setLoadingMore(true);
      }

      const selectBase = `
        id,
        author_id,
        content,
        created_at,
        views_count,
        likes_count,
        comments_count,
        shares_count,
        is_published,
        media:post_media(id, media_url, media_type, sort_order)
      `;
      const selectWithSaves = `
        id,
        author_id,
        content,
        created_at,
        views_count,
        likes_count,
        comments_count,
        saves_count,
        shares_count,
        is_published,
        media:post_media(id, media_url, media_type, sort_order)
      `;

      let followingIds: string[] | null = null;
      if (mode === 'following' && user) {
        const { data: followingData } = await supabase
          .from('followers')
          .select('following_id')
          .eq('follower_id', user.id);

        followingIds = followingData?.map((f: { following_id: string }) => f.following_id) ?? [];
        if (followingIds.length === 0) {
          // Persisted "following" mode can make the feed look broken for users without subscriptions.
          // Fall back to smart feed instead of returning an empty page.
          setMode('smart');
          return;
        }
      }

      const buildQuery = (selectClause: string) => {
        let q = supabase
          .from('posts')
          .select(selectClause)
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(PAGE_SIZE);

        const cursor = reset ? null : cursorRef.current;
        if (cursor) {
          const createdAt = cursor.createdAt;
          const postId = cursor.id;
          q = q.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${postId})`);
        }

        if (mode === 'following' && followingIds && followingIds.length > 0) {
          q = q.in('author_id', followingIds);
        }

        return q;
      };

      let includesSavesColumn = true;
      let { data: rawPosts, error: fetchError } = await buildQuery(selectWithSaves);

      const fetchErrorText = String(fetchError?.message || fetchError?.details || '');
      const isMissingSavesColumn = !!fetchError && /(saves_count|column)/i.test(fetchErrorText);
      if (isMissingSavesColumn) {
        includesSavesColumn = false;
        const retry = await buildQuery(selectBase);
        rawPosts = retry.data;
        fetchError = retry.error;
      }

      if (fetchError) throw fetchError;

      if (!rawPosts || rawPosts.length === 0) {
        setHasMore(false);
        if (reset) setPosts([]);
        setError(null);
        return;
      }

      if (rawPosts.length < PAGE_SIZE) setHasMore(false);

      const lastPost = rawPosts[rawPosts.length - 1] as any;
      if (lastPost?.created_at && lastPost?.id) {
        cursorRef.current = {
          createdAt: String(lastPost.created_at),
          id: String(lastPost.id),
        };
      }

      const postIds = rawPosts.map((p: any) => p.id);
      const authorIds = [...new Set(rawPosts.map((p: any) => p.author_id))];

      // Получаем liked posts
      let likedIds = new Set<string>();
      const [profilesRes, likesRes, postLikesRes, postCommentsRes, postSavesRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', authorIds),
        user
          ? supabase
              .from('post_likes')
              .select('post_id')
              .eq('user_id', user.id)
              .in('post_id', postIds)
          : Promise.resolve({ data: [] as { post_id: string }[] }),
        supabase
          .from('post_likes')
          .select('post_id')
          .in('post_id', postIds),
        supabase
          .from('comments')
          .select('post_id')
          .in('post_id', postIds),
        includesSavesColumn
          ? Promise.resolve({ data: [] as { post_id: string }[] })
          : supabase
              .from('saved_posts')
              .select('post_id')
              .in('post_id', postIds),
      ]);

      likedIds = new Set((likesRes.data ?? []).map((l: { post_id: string }) => l.post_id));
      const profilesMap = new Map((profilesRes.data ?? []).map((p: any) => [p.user_id, p]));

      // Синхронизируем счетчики с реальными источниками активности.
      const likesCountMap = new Map<string, number>();
      const commentsCountMap = new Map<string, number>();
      const savesCountMap = new Map<string, number>();

      (postLikesRes.data ?? []).forEach((row: { post_id: string }) => {
        likesCountMap.set(row.post_id, (likesCountMap.get(row.post_id) ?? 0) + 1);
      });
      (postCommentsRes.data ?? []).forEach((row: { post_id: string }) => {
        commentsCountMap.set(row.post_id, (commentsCountMap.get(row.post_id) ?? 0) + 1);
      });
      (postSavesRes.data ?? []).forEach((row: { post_id: string }) => {
        savesCountMap.set(row.post_id, (savesCountMap.get(row.post_id) ?? 0) + 1);
      });

      // Получаем теги постов
      let postTagsMap = new Map<string, string[]>();
      try {
        const { data: tagData } = await (supabase as any)
          .from('post_content_tags')
          .select('post_id, tag')
          .in('post_id', postIds);
        if (tagData) {
          tagData.forEach((row: { post_id: string; tag: string }) => {
            const existing = postTagsMap.get(row.post_id) ?? [];
            existing.push(row.tag);
            postTagsMap.set(row.post_id, existing);
          });
        }
      } catch {
        // ignore
      }

      // Ранжируем посты
      const recentAuthors: string[] = [];
      const scoredPosts: ScoredPost[] = rawPosts.map((post: any) => {
        const likesCount = Math.max(0, likesCountMap.get(post.id) ?? (post.likes_count ?? 0));
        const commentsCount = Math.max(0, commentsCountMap.get(post.id) ?? (post.comments_count ?? 0));
        const savesCount = includesSavesColumn
          ? Math.max(0, post.saves_count ?? 0)
          : Math.max(0, savesCountMap.get(post.id) ?? (post.saves_count ?? 0));
        const sharesCount = Math.max(0, post.shares_count ?? 0);
        const viewsCount = Math.max(1, post.views_count ?? 1);
        const affinityScore = authorAffinityCache.current.get(post.author_id) ?? 0;
        const recencyScore = applyRecencyDecay(new Date(post.created_at), 24);
        const engagementScore = calculateEngagementRate(
          likesCount,
          commentsCount,
          0,
          sharesCount,
          viewsCount,
        );
        const postTags = postTagsMap.get(post.id) ?? [];
        const contentRelevance = calculateContentRelevance(postTags, userInterestsCache.current);
        const diversity = diversityPenalty(recentAuthors, post.author_id);

        recentAuthors.push(post.author_id);

        const hasMedia = (post.media?.length ?? 0) > 0;
        const contentType: 'image' | 'text' = hasMedia ? 'image' : 'text';

        const score = mode === 'smart'
          ? calculateFeedScore({
            engagementScore,
            authorAffinity: affinityScore,
            recencyScore,
            contentRelevance,
            diversityBonus: diversity,
            isCloseFriend: false,
            isFollowing: false,
            hasInteracted: likedIds.has(post.id),
            contentType,
          })
          : recencyScore; // для хронологического — только recency

        const profile = profilesMap.get(post.author_id);

        return {
          ...post,
          likes_count: likesCount,
          comments_count: commentsCount,
          saves_count: savesCount,
          shares_count: sharesCount,
          views_count: Math.max(0, post.views_count ?? 0),
          author: profile
            ? {
                id: profile.user_id,
                display_name: profile.display_name,
                avatar_url: profile.avatar_url,
              }
            : undefined,
          media: (post.media ?? []).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
          is_liked: likedIds.has(post.id),
          score,
        } as ScoredPost;
      });

      const ranked = mode === 'smart' ? rankFeedItems(scoredPosts) : scoredPosts;

      if (reset) {
        setPosts(ranked);
      } else {
        setPosts(prev => [...prev, ...ranked]);
      }

      // Successful fetch path should never keep old error visible.
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки ленты');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [mode, user, hasMore, setMode]);

  // Инициализация
  useEffect(() => {
    loadUserAffinity();
    loadUserInterests();
  }, [loadUserAffinity, loadUserInterests]);

  // Перезагрузка при смене режима
  useEffect(() => {
    setHasMore(true);
    fetchPosts(true);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const refetch = useCallback(() => {
    setHasMore(true);
    return fetchPosts(true);
  }, [fetchPosts]);

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      fetchPosts(false);
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
  };
}
