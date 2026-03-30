import { useState, useCallback } from 'react';
import { supabase, dbLoose } from '@/lib/supabase';

export type SearchType = 'all' | 'users' | 'hashtags' | 'posts' | 'locations';
export type SearchHistoryType = 'general' | 'user' | 'hashtag' | 'location';

// Локальные типы для колонок posts, отсутствующих в сгенерированных типах
interface PostSearchRow {
  id: string;
  content: string | null;
  image_urls: string[] | null;
  likes_count: number;
  comments_count: number;
  profiles?: { username: string | null; avatar_url: string | null } | null;
}

interface PostLocationRow {
  location: string | null;
}

interface PostExploreRow {
  id: string;
  image_urls: string[] | null;
  video_url: string | null;
  likes_count: number;
  comments_count: number;
  content: string | null;
}

export interface SearchResultUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  followers_count: number;
  is_verified: boolean;
}

export interface SearchResultHashtag {
  id: string;
  name: string;
  post_count: number;
}

export interface SearchResultPost {
  id: string;
  content: string;
  image_urls: string[];
  likes_count: number;
  comments_count: number;
  author: {
    username: string;
    avatar_url: string | null;
  };
}

export interface SearchResults {
  users: SearchResultUser[];
  hashtags: SearchResultHashtag[];
  posts: SearchResultPost[];
  locations: string[];
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  type: SearchHistoryType;
  result_id: string | null;
  created_at: string;
}

export interface TrendingHashtag {
  id: string;
  tag: string;
  post_count: number;
  recent_count: number;
  growth_rate: number;
}

export interface ExplorePost {
  id: string;
  image_urls: string[];
  video_url: string | null;
  type: 'post' | 'reel' | 'carousel';
  likes_count: number;
  comments_count: number;
  category: string | null;
}

export function useExploreSearch() {
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResults>({
    users: [],
    hashtags: [],
    posts: [],
    locations: [],
  });
  const [exploreContent, setExploreContent] = useState<ExplorePost[]>([]);
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [trending, setTrending] = useState<TrendingHashtag[]>([]);

  const search = useCallback(async (query: string, type: SearchType = 'all') => {
    if (!query.trim()) {
      setSearchResults({ users: [], hashtags: [], posts: [], locations: [] });
      return;
    }
    setLoading(true);
    try {
      const tsQuery = query.trim().split(/\s+/).join(' & ');

      const results: SearchResults = { users: [], hashtags: [], posts: [], locations: [] };

      if (type === 'all' || type === 'users') {
        const { data: users } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, bio')
          .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
          .limit(20);
        results.users = (users || []).map((u) => ({
          id: u.id,
          username: u.username ?? '',
          display_name: u.display_name ?? '',
          avatar_url: u.avatar_url,
          bio: u.bio,
          followers_count: 0,
          is_verified: false,
        }));
      }

      if (type === 'all' || type === 'hashtags') {
        const { data: tags } = await supabase
          .from('hashtags')
          .select('id, tag, posts_count')
          .ilike('tag', `%${query.replace(/^#/, '')}%`)
          .order('posts_count', { ascending: false })
          .limit(20);
        results.hashtags = (tags || []).map((t) => ({
          id: t.id,
          name: t.tag,
          post_count: t.posts_count ?? 0,
        }));
      }

      if (type === 'all' || type === 'posts') {
        const { data: rawPosts } = await dbLoose
          .from('posts')
          .select('id, content, image_urls, likes_count, comments_count, profiles(username, avatar_url)')
          .ilike('content', `%${query}%`)
          .limit(20);
        const posts = (rawPosts ?? []) as PostSearchRow[];
        results.posts = posts.map((p) => ({
          id: p.id,
          content: p.content ?? '',
          image_urls: p.image_urls ?? [],
          likes_count: p.likes_count || 0,
          comments_count: p.comments_count || 0,
          author: {
            username: p.profiles?.username ?? '',
            avatar_url: p.profiles?.avatar_url ?? null,
          },
        }));
      }

      if (type === 'all' || type === 'locations') {
        const { data: rawLocs } = await dbLoose
          .from('posts')
          .select('location')
          .ilike('location', `%${query}%`)
          .not('location', 'is', null)
          .limit(20);
        const locs = (rawLocs ?? []) as PostLocationRow[];
        const unique = [...new Set(locs.map((l) => l.location).filter(Boolean))];
        results.locations = unique as string[];
      }

      setSearchResults(results);
    } finally {
      setLoading(false);
    }
  }, []);

  const getSearchHistory = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await (supabase as any)
      .from('search_history')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setHistory(data || []);
  }, []);

  const clearSearchHistory = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await (supabase as any)
      .from('search_history')
      .delete()
      .eq('user_id', user.id);
    setHistory([]);
  }, []);

  const deleteSearchHistoryItem = useCallback(async (id: string) => {
    await (supabase as any)
      .from('search_history')
      .delete()
      .eq('id', id);
    setHistory(prev => prev.filter(h => h.id !== id));
  }, []);

  const getTrendingHashtags = useCallback(async () => {
    const { data } = await (supabase as any)
      .from('trending_hashtags')
      .select('*')
      .order('recent_count', { ascending: false })
      .limit(20);
    if (data && data.length > 0) {
      setTrending(data);
    } else {
      // Fallback: get from hashtags table
      const { data: tags } = await supabase
        .from('hashtags')
        .select('id, tag, posts_count')
        .order('posts_count', { ascending: false })
        .limit(20);
      setTrending((tags || []).map((t) => ({
        id: t.id,
        tag: t.tag,
        post_count: t.posts_count ?? 0,
        recent_count: 0,
        growth_rate: 0,
      })));
    }
  }, []);

  const getExploreContent = useCallback(async (category?: string) => {
    setLoading(true);
    try {
      let query = dbLoose
        .from('posts')
        .select('id, image_urls, video_url, likes_count, comments_count, content')
        .not('image_urls', 'is', null)
        .order('likes_count', { ascending: false })
        .limit(30);

      if (category && category !== 'all') {
        query = query.ilike('content', `%${category}%`);
      }

      const { data: rawPosts } = await query;
      const posts = (rawPosts ?? []) as PostExploreRow[];

      const { data: reels } = await supabase
        .from('reels')
        .select('id, video_url, likes_count, comments_count, thumbnail_url')
        .order('likes_count', { ascending: false })
        .limit(20);

      const postsFormatted: ExplorePost[] = posts.map((p) => ({
        id: p.id,
        image_urls: p.image_urls ?? [],
        video_url: p.video_url ?? null,
        type: p.video_url ? 'reel' : (p.image_urls && p.image_urls.length > 1 ? 'carousel' : 'post'),
        likes_count: p.likes_count || 0,
        comments_count: p.comments_count || 0,
        category: null,
      }));

      const reelsFormatted: ExplorePost[] = (reels || []).map((r) => ({
        id: r.id,
        image_urls: r.thumbnail_url ? [r.thumbnail_url] : [],
        video_url: r.video_url,
        type: 'reel' as const,
        likes_count: r.likes_count || 0,
        comments_count: r.comments_count || 0,
        category: null,
      }));

      // Перемешать посты и рилсы
      const combined = [...postsFormatted, ...reelsFormatted].sort(() => Math.random() - 0.5);
      setExploreContent(combined);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveSearchQuery = useCallback(async (
    query: string,
    type: SearchHistoryType = 'general',
    resultId?: string
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await (supabase as any)
      .from('search_history')
      .insert({
        user_id: user.id,
        query,
        type,
        result_id: resultId || null,
      });
  }, []);

  return {
    loading,
    searchResults,
    exploreContent,
    history,
    trending,
    search,
    getSearchHistory,
    clearSearchHistory,
    deleteSearchHistoryItem,
    getTrendingHashtags,
    getExploreContent,
    saveSearchQuery,
  };
}
