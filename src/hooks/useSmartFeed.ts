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

  const offsetRef = useRef(0);
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
      if (reset) {
        setLoading(true);
        offsetRef.current = 0;
      } else {
        setLoadingMore(true);
      }

      const offset = reset ? 0 : offsetRef.current;

      let query = supabase
        .from('posts')
        .select(`
          id,
          author_id,
          content,
          created_at,
          views_count,
          likes_count,
          comments_count,
          shares_count,
          is_published,
          author:profiles!posts_author_id_fkey(id, display_name, avatar_url),
          media:post_media(id, media_url, media_type, sort_order)
        `)
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      // Для режима "following" фильтруем по подпискам
      if (mode === 'following' && user) {
        const { data: followingData } = await supabase
          .from('followers')
          .select('following_id')
          .eq('follower_id', user.id);

        const followingIds = followingData?.map((f: { following_id: string }) => f.following_id) ?? [];
        if (followingIds.length > 0) {
          query = query.in('author_id', followingIds);
        } else {
          if (reset) setPosts([]);
          setHasMore(false);
          setLoading(false);
          return;
        }
      }

      const { data: rawPosts, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      if (!rawPosts || rawPosts.length === 0) {
        setHasMore(false);
        if (reset) setPosts([]);
        return;
      }

      if (rawPosts.length < PAGE_SIZE) setHasMore(false);
      offsetRef.current = offset + rawPosts.length;

      // Получаем liked posts
      let likedIds = new Set<string>();
      if (user) {
        const { data: likes } = await supabase
          .from('post_likes')
          .select('post_id')
          .eq('user_id', user.id)
          .in('post_id', rawPosts.map((p: any) => p.id));
        likedIds = new Set(likes?.map((l: { post_id: string }) => l.post_id) ?? []);
      }

      // Получаем теги постов
      const postIds = rawPosts.map((p: any) => p.id);
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
        const affinityScore = authorAffinityCache.current.get(post.author_id) ?? 0;
        const recencyScore = applyRecencyDecay(new Date(post.created_at), 24);
        const engagementScore = calculateEngagementRate(
          post.likes_count ?? 0,
          post.comments_count ?? 0,
          0,
          post.shares_count ?? 0,
          Math.max(post.views_count ?? 1, 1)
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

        const authorData = Array.isArray(post.author) ? post.author[0] : post.author;

        return {
          ...post,
          author: authorData,
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки ленты');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [mode, user, hasMore]);

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
