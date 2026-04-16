import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  rankContent,
  diversifyResults,
  coldStartRecommendations,
  DEFAULT_CONFIG,
  type ContentItem,
  type UserEmbedding,
} from '@/lib/recommendations/engine';
import { logger } from '@/lib/logger';
import { dbLoose } from "@/lib/supabase";

// Утилиты
function extractHashtags(text: string): string[] {
  return (text.match(/#[\w\u0400-\u04FF]+/g) ?? []).map((t) => t.slice(1).toLowerCase());
}

// Локальные типы для таблиц без сгенерированных типов
interface SimilarUserRow {
  similar_user_id: string;
  similarity_score: number | null;
}

interface RecommendedUser {
  id: string;
  username: string | null;
  avatar_url: string | null;
  full_name: string | null;
  reason?: string;
  similarityScore?: number;
}

interface EngagementMetrics {
  likes_count?: number | null;
  comments_count?: number | null;
  shares_count?: number | null;
  views_count?: number | null;
}

function computeEngagementRate(post: EngagementMetrics): number {
  const total = (post.likes_count ?? 0) + (post.comments_count ?? 0) * 2 + (post.shares_count ?? 0) * 3;
  const views = Math.max(post.views_count ?? 100, 1);
  return Math.min(total / views, 1);
}

const EMPTY_EMBEDDING: UserEmbedding = {
  userId: '',
  interests: {},
  contentCreators: {},
  hashtagAffinities: {},
  avgSessionMinutes: 0,
  preferredContentType: 'mixed',
  activeHours: {},
};

export function useRecommendations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEmbedding, setUserEmbedding] = useState<UserEmbedding>(EMPTY_EMBEDDING);
  const [interactionCount, setInteractionCount] = useState(0);

  useEffect(() => {
    void loadUserEmbedding();
    void loadInteractionCount();
  }, []);

  async function loadUserEmbedding() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await dbLoose
        .from('user_embeddings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        logger.warn('recommendations: failed to load user embedding', { userId: user.id, error });
        setUserEmbedding({ ...EMPTY_EMBEDDING, userId: user.id });
        return;
      }

      if (!data) {
        setUserEmbedding({ ...EMPTY_EMBEDDING, userId: user.id });
        return;
      }

      setUserEmbedding({
        userId: user.id,
        interests: data.interests ?? {},
        contentCreators: data.content_creators ?? {},
        hashtagAffinities: data.hashtag_affinities ?? {},
        avgSessionMinutes: data.avg_session_minutes ?? 0,
        preferredContentType: data.preferred_content_type ?? 'mixed',
        activeHours: data.active_hours ?? {},
      });
    } catch (error) {
      logger.warn('recommendations: unexpected embedding load failure', { error });
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmbedding({ ...EMPTY_EMBEDDING, userId: user.id });
      }
    }
  }

  async function loadInteractionCount() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { count } = await dbLoose
        .from('user_interactions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
      setInteractionCount(count ?? 0);
    } catch (error) {
      logger.debug('recommendations: interaction count unavailable', { error });
    }
  }

  const getUserEmbedding = useCallback(() => userEmbedding, [userEmbedding]);

  const getRecommendedFeed = useCallback(async (page = 0, limit = 20): Promise<ContentItem[]> => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const isColdStart = interactionCount < DEFAULT_CONFIG.coldStartThreshold;

      const { data: posts } = await supabase
        .from('posts')
        .select('id, author_id, content, created_at, likes_count, comments_count')
        .order('created_at', { ascending: false })
        .range(page * limit * 3, (page + 1) * limit * 3 - 1);

      if (!posts?.length) return [];

      const items: ContentItem[] = posts.map((p) => ({
        id: p.id,
        authorId: p.author_id,
        contentType: 'post' as const,
        categories: [],
        hashtags: extractHashtags(p.content ?? ''),
        engagementRate: computeEngagementRate(p),
        likesCount: p.likes_count ?? 0,
        commentsCount: p.comments_count ?? 0,
        sharesCount: 0,
        createdAt: p.created_at,
      }));

      if (isColdStart) {
        return coldStartRecommendations(items, limit);
      }

      const collaborativeMap = new Map<string, number>();
      const { data: similar } = await dbLoose
        .from('similar_users')
        .select('similar_user_id, similarity_score')
        .eq('user_id', user.id)
        .order('similarity_score', { ascending: false })
        .limit(20);

      if (similar?.length) {
        const similarIds = similar.map((s: SimilarUserRow) => s.similar_user_id);
        const { data: similarPosts } = await supabase
          .from('posts')
          .select('id, author_id')
          .in('author_id', similarIds)
          .order('created_at', { ascending: false })
          .limit(100);

        if (similarPosts) {
          for (const sp of similarPosts) {
            const sim = similar.find((s: SimilarUserRow) => s.similar_user_id === sp.author_id);
            collaborativeMap.set(sp.id, sim?.similarity_score ?? 0);
          }
        }
      }

      const trendingMap = new Map<string, number>(items.map((i) => [i.id, i.engagementRate]));
      const ranked = rankContent(items, userEmbedding, collaborativeMap, trendingMap);
      const diversified = diversifyResults(ranked, DEFAULT_CONFIG.maxSameAuthor);
      return diversified.slice(0, limit);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки рекомендаций');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [userEmbedding, interactionCount]);

  const getRecommendedUsers = useCallback(async (limit = 10): Promise<RecommendedUser[]> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data: following } = await supabase
        .from('followers')
        .select('following_id')
        .eq('follower_id', user.id);
      const followingIds = new Set<string>((following ?? []).map((f) => f.following_id));
      followingIds.add(user.id);

      const { data: similar } = await dbLoose
        .from('similar_users')
        .select('similar_user_id, similarity_score')
        .eq('user_id', user.id)
        .order('similarity_score', { ascending: false })
        .limit(50);

      const candidates = (similar ?? []).filter((s: SimilarUserRow) => !followingIds.has(s.similar_user_id)).slice(0, limit);

      if (!candidates.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, full_name')
          .neq('id', user.id)
          .not('username', 'is', null)
          .limit(limit);
        return (profiles ?? []).filter(p => p.username?.trim());
      }

      const ids = candidates.map((c: SimilarUserRow) => c.similar_user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, full_name')
        .in('id', ids);

      return (profiles ?? []).filter(p => p.username?.trim()).map((p) => ({
        ...p,
        reason: 'similar_interests' as const,
        similarityScore: candidates.find((c: SimilarUserRow) => c.similar_user_id === p.id)?.similarity_score ?? 0,
      }));
    } catch {
      return [];
    }
  }, []);

  const getRecommendedReels = useCallback(async (limit = 20) => {
    try {
      const { data: reels } = await supabase
        .from('reels')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit * 3);

      if (!reels?.length) return [];

      const items: ContentItem[] = reels.map((r) => ({
        id: r.id,
        authorId: r.author_id,
        contentType: 'reel' as const,
        categories: [],
        hashtags: extractHashtags(r.description ?? ''),
        engagementRate: computeEngagementRate(r),
        likesCount: r.likes_count ?? 0,
        commentsCount: r.comments_count ?? 0,
        sharesCount: 0,
        createdAt: r.created_at ?? new Date().toISOString(),
      }));

      const trendingMap = new Map<string, number>(items.map((i) => [i.id, i.engagementRate]));
      const ranked = rankContent(items, userEmbedding, new Map(), trendingMap);
      return ranked.slice(0, limit);
    } catch {
      return [];
    }
  }, [userEmbedding]);

  const getSimilarContent = useCallback(async (_contentId: string, limit = 6): Promise<ContentItem[]> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await dbLoose
        .from('recommended_content')
        .select('content_id, score, reason')
        .eq('user_id', user.id)
        .order('score', { ascending: false })
        .limit(limit);
      return (data ?? []) as unknown as ContentItem[];
    } catch {
      return [];
    }
  }, []);

  const refreshRecommendations = useCallback(async () => {
    await loadUserEmbedding();
    await loadInteractionCount();
  }, []);

  return {
    isLoading,
    error,
    getUserEmbedding,
    getRecommendedFeed,
    getRecommendedUsers,
    getRecommendedReels,
    getSimilarContent,
    refreshRecommendations,
  };
}
