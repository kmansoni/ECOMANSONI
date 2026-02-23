import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { checkHashtagsAllowedForText } from '@/lib/hashtagModeration';

export interface Post {
  id: string;
  author_id: string;
  content: string | null;
  created_at: string;
  views_count: number;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  is_published: boolean;
  author?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  media?: {
    id: string;
    media_url: string;
    media_type: string;
    sort_order: number;
  }[];
  is_liked?: boolean;
}

// Generate a session ID for tracking views
const getSessionId = () => {
  let sessionId = sessionStorage.getItem('view_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('view_session_id', sessionId);
  }
  return sessionId;
};

export type FeedFilter = 'all' | 'following';

export function usePosts(filter: FeedFilter = 'all') {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);

      // If filtering by following, first get the list of followed users
      let followingIds: string[] = [];
      if (filter === 'following' && user) {
        const { data: followingData } = await supabase
          .from('followers')
          .select('following_id')
          .eq('follower_id', user.id);
        
        followingIds = followingData?.map(f => f.following_id) || [];
        
        // If user doesn't follow anyone, return empty
        if (followingIds.length === 0) {
          setPosts([]);
          setLoading(false);
          return;
        }
      }
      
      // F2: Optimized query with JOINs - single query for posts + media + likes
      let query = supabase
        .from('posts')
        .select(`
          *,
          post_media (
            id,
            media_url,
            media_type,
            sort_order
          )
        `)
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(50);

      // Apply following filter if needed
      if (filter === 'following' && followingIds.length > 0) {
        query = query.in('author_id', followingIds);
      }

      const { data: postsData, error: postsError } = await query;

      if (postsError) throw postsError;

      if (!postsData || postsData.length === 0) {
        setPosts([]);
        setLoading(false);
        return;
      }
        
      // Fetch profiles and likes in parallel for remaining data
      const authorIds = [...new Set(postsData.map(p => p.author_id))];
      const postIds = postsData.map(p => p.id);

      const [profilesRes, likesRes] = await Promise.all([
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
          : Promise.resolve({ data: [] })
      ]);

      const profilesMap = new Map(profilesRes.data?.map(p => [p.user_id, p]) || []);
      const likedPostIds = new Set(likesRes.data?.map(l => l.post_id) || []);

      const finalPosts: Post[] = postsData.map(post => ({
        ...post,
        author: profilesMap.get(post.author_id) ? {
          id: post.author_id,
          display_name: profilesMap.get(post.author_id)?.display_name,
          avatar_url: profilesMap.get(post.author_id)?.avatar_url
        } : undefined,
        media: (post.post_media || []).sort((a: any, b: any) => a.sort_order - b.sort_order),
        is_liked: likedPostIds.has(post.id)
      }));

      setPosts(finalPosts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch posts');
    } finally {
      setLoading(false);
    }
  }, [user, filter]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Subscribe to realtime updates for posts
  useEffect(() => {
    let channel: RealtimeChannel;

    let insertDebounceTimer: number | undefined;
    const scheduleInsertSync = (handler: () => void, ms = 250) => {
      if (insertDebounceTimer) window.clearTimeout(insertDebounceTimer);
      insertDebounceTimer = window.setTimeout(handler, ms);
    };

    const setupSubscription = () => {
      channel = supabase
        .channel('posts-realtime')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'posts' },
          (payload) => {
            const inserted = payload.new as any;
            scheduleInsertSync(() => {
              void (async () => {
                try {
                  if (!inserted?.id) return;
                  if (inserted.is_published === false) return;

                  // For the 'following' feed, avoid doing extra lookups on every insert.
                  // Debounced full refresh is simpler and still prevents per-insert thrash.
                  if (filter === 'following') {
                    await fetchPosts();
                    return;
                  }

                  const { data: postRow, error: postError } = await supabase
                    .from('posts')
                    .select(`
                      *,
                      post_media (
                        id,
                        media_url,
                        media_type,
                        sort_order
                      )
                    `)
                    .eq('id', inserted.id)
                    .maybeSingle();

                  if (postError || !postRow) return;

                  // Add author profile
                  const { data: profile } = await supabase
                    .from('profiles')
                    .select('user_id, display_name, avatar_url')
                    .eq('user_id', postRow.author_id)
                    .maybeSingle();

                  let isLiked = false;
                  if (user) {
                    const { data: likeRow } = await supabase
                      .from('post_likes')
                      .select('post_id')
                      .eq('user_id', user.id)
                      .eq('post_id', postRow.id)
                      .maybeSingle();
                    isLiked = !!likeRow;
                  }

                  const hydrated: Post = {
                    ...postRow,
                    author: profile
                      ? { id: profile.user_id, display_name: profile.display_name, avatar_url: profile.avatar_url }
                      : undefined,
                    media: (postRow.post_media || []).sort((a: any, b: any) => a.sort_order - b.sort_order),
                    is_liked: isLiked,
                  };

                  setPosts((prev) => {
                    if (prev.some((p) => p.id === hydrated.id)) return prev;
                    return [hydrated, ...prev].slice(0, 50);
                  });
                } catch {
                  // Best-effort; fallback is UPDATE handler + manual refetch.
                }
              })();
            });
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'posts' },
          (payload) => {
            const updatedPost = payload.new as any;
            // Update post in place without changing order
            setPosts(prev => {
              const index = prev.findIndex(post => post.id === updatedPost.id);
              if (index === -1) return prev;
              
              // Create new array with updated post at same position
              const newPosts = [...prev];
              newPosts[index] = { 
                ...newPosts[index], 
                // Only update specific fields to prevent position jumps
                views_count: updatedPost.views_count,
                likes_count: updatedPost.likes_count,
                comments_count: updatedPost.comments_count,
                shares_count: updatedPost.shares_count,
                content: updatedPost.content,
                is_published: updatedPost.is_published
              };
              return newPosts;
            });
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'posts' },
          (payload) => {
            const deletedPost = payload.old as any;
            setPosts(prev => prev.filter(post => post.id !== deletedPost.id));
          }
        )
        .subscribe();
    };

    setupSubscription();

    return () => {
      if (insertDebounceTimer) window.clearTimeout(insertDebounceTimer);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [fetchPosts, filter, user]);

  return { posts, loading, error, refetch: fetchPosts, setPosts };
}

export function usePostActions() {
  const { user } = useAuth();
  const [viewedPosts] = useState(new Set<string>());

  const recordView = useCallback(async (postId: string) => {
    // Prevent duplicate views in same session (client-side optimization)
    if (viewedPosts.has(postId)) return;
    viewedPosts.add(postId);
    
    try {
      const sessionId = getSessionId();
      
      // Use upsert with onConflict to silently ignore duplicates
      // DB has unique constraint on (post_id, user_id, session_id)
      await supabase.from('post_views').upsert({
        post_id: postId,
        user_id: user?.id || null,
        session_id: sessionId
      }, {
        onConflict: 'post_id,user_id,session_id',
        ignoreDuplicates: true
      });
    } catch (err) {
      // Silently ignore - view tracking is non-critical
      console.error('Failed to record view:', err);
    }
  }, [user, viewedPosts]);

  const toggleLike = useCallback(async (postId: string, isCurrentlyLiked: boolean) => {
    if (!user) {
      return { error: 'Must be logged in to like posts' };
    }

    try {
      if (isCurrentlyLiked) {
        const { error } = await supabase
          .from('post_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('post_likes')
          .insert({ post_id: postId, user_id: user.id });
        if (error) throw error;
      }
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to update like' };
    }
  }, [user]);

  const createPost = useCallback(async (content: string, mediaUrls?: string[]) => {
    if (!user) {
      return { error: 'Must be logged in to create posts', post: null };
    }

    try {
      const hashtagVerdict = await checkHashtagsAllowedForText(String(content || '').trim());
      if (!hashtagVerdict.ok) {
        return { error: `HASHTAG_BLOCKED:${("blockedTags" in hashtagVerdict ? hashtagVerdict.blockedTags : []).join(', ')}`, post: null };
      }

      const { data: post, error: postError } = await supabase
        .from('posts')
        .insert({ author_id: user.id, content })
        .select()
        .single();

      if (postError) throw postError;

      // Add media if provided
      if (mediaUrls && mediaUrls.length > 0) {
        const mediaInserts = mediaUrls.map((url, index) => ({
          post_id: post.id,
          media_url: url,
          media_type: url.includes('.mp4') || url.includes('.webm') ? 'video' : 'image',
          sort_order: index
        }));

        await supabase.from('post_media').insert(mediaInserts);
      }

      return { error: null, post };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to create post', post: null };
    }
  }, [user]);

  return { recordView, toggleLike, createPost };
}
