import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useSavedPosts() {
  const { user } = useAuth();
  const [savedPostIds, setSavedPostIds] = useState<Set<string>>(new Set());
  const [savedPosts, setSavedPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all saved post IDs for quick lookup
  const fetchSavedPostIds = useCallback(async () => {
    if (!user) {
      setSavedPostIds(new Set());
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await (supabase as any)
        .from('saved_posts')
        .select('post_id')
        .eq('user_id', user.id);

      if (error) throw error;

      setSavedPostIds(new Set(data?.map((s: any) => s.post_id) || []));
    } catch (err) {
      console.error('Failed to fetch saved posts:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch full saved posts with details
  const fetchSavedPosts = useCallback(async () => {
    if (!user) {
      setSavedPosts([]);
      return;
    }

    try {
      // First get saved post IDs
      const { data: savedData, error: savedError } = await (supabase as any)
        .from('saved_posts')
        .select('post_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (savedError) throw savedError;

      if (!savedData || savedData.length === 0) {
        setSavedPosts([]);
        return;
      }

      const postIds = savedData.map((s: any) => s.post_id);

      // Then fetch the actual posts
      const { data: postsData, error: postsError } = await supabase
        .from('posts')
        .select(`
          *,
          post_media (*)
        `)
        .in('id', postIds);

      if (postsError) throw postsError;

      // Map saved_at timestamps to posts
      const savedMap = new Map(savedData.map((s: any) => [s.post_id, s.created_at]));
      const posts = postsData?.map(p => ({
        ...p,
        saved_at: savedMap.get(p.id),
      })).filter(Boolean) || [];

      setSavedPosts(posts);
    } catch (err) {
      console.error('Failed to fetch saved posts details:', err);
    }
  }, [user]);

  useEffect(() => {
    fetchSavedPostIds();
  }, [fetchSavedPostIds]);

  const isSaved = useCallback((postId: string) => {
    return savedPostIds.has(postId);
  }, [savedPostIds]);

  const savePost = useCallback(async (postId: string) => {
    if (!user) return;

    try {
      const { error } = await (supabase as any)
        .from('saved_posts')
        .insert({ user_id: user.id, post_id: postId });

      if (error) throw error;

      setSavedPostIds(prev => new Set([...prev, postId]));
    } catch (err) {
      console.error('Failed to save post:', err);
      throw err;
    }
  }, [user]);

  const unsavePost = useCallback(async (postId: string) => {
    if (!user) return;

    try {
      const { error } = await (supabase as any)
        .from('saved_posts')
        .delete()
        .eq('user_id', user.id)
        .eq('post_id', postId);

      if (error) throw error;

      setSavedPostIds(prev => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
    } catch (err) {
      console.error('Failed to unsave post:', err);
      throw err;
    }
  }, [user]);

  const toggleSave = useCallback(async (postId: string) => {
    if (isSaved(postId)) {
      await unsavePost(postId);
    } else {
      await savePost(postId);
    }
  }, [isSaved, savePost, unsavePost]);

  return {
    savedPostIds,
    savedPosts,
    loading,
    isSaved,
    savePost,
    unsavePost,
    toggleSave,
    fetchSavedPosts,
    refetch: fetchSavedPostIds,
  };
}
