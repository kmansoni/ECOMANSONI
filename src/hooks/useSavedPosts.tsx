import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useSavedPosts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const savedIdsQueryKey = useMemo(() => ["saved_posts_ids", user?.id ?? null] as const, [user?.id]);

  const savedIdsQuery = useQuery({
    queryKey: savedIdsQueryKey,
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("saved_posts")
        .select("post_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data || []).map((s: any) => String(s.post_id));
    },
    staleTime: 30_000,
  });

  const savedPostIds = useMemo(() => {
    const ids = savedIdsQuery.data || [];
    return new Set(ids);
  }, [savedIdsQuery.data]);

  const savedPostsQueryKey = useMemo(() => ["saved_posts_full", user?.id ?? null] as const, [user?.id]);

  const savedPostsQuery = useQuery({
    queryKey: savedPostsQueryKey,
    enabled: false,
    queryFn: async () => {
      if (!user?.id) return [];

      const { data: savedData, error: savedError } = await (supabase as any)
        .from("saved_posts")
        .select("post_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (savedError) throw savedError;

      if (!savedData || savedData.length === 0) {
        return [];
      }

      const postIds = savedData.map((s: any) => s.post_id);

      const { data: postsData, error: postsError } = await supabase
        .from("posts")
        .select(`
          *,
          post_media (*)
        `)
        .in("id", postIds);

      if (postsError) throw postsError;

      const savedMap = new Map(savedData.map((s: any) => [s.post_id, s.created_at]));
      const posts = (postsData || [])
        .map((p: any) => ({
          ...p,
          saved_at: savedMap.get(p.id),
        }))
        .filter(Boolean);

      return posts;
    },
    staleTime: 10_000,
  });

  const loading = savedIdsQuery.isLoading || savedPostsQuery.isFetching;

  const savedPosts = savedPostsQuery.data || [];

  // Fetch full saved posts with details (used on Saved page)
  const fetchSavedPosts = useCallback(async () => {
    await savedPostsQuery.refetch();
  }, [savedPostsQuery.refetch]);

  const isSaved = useCallback((postId: string) => {
    return savedPostIds.has(postId);
  }, [savedPostIds]);

  const saveMutation = useMutation({
    mutationFn: async (postId: string) => {
      if (!user?.id) throw new Error("Not authenticated");
      const { error } = await (supabase as any)
        .from("saved_posts")
        .insert({ user_id: user.id, post_id: postId });
      if (error) throw error;
      return postId;
    },
    onSuccess: (postId) => {
      queryClient.setQueryData<string[]>(savedIdsQueryKey, (prev) => {
        const list = prev || [];
        if (list.includes(postId)) return list;
        return [...list, postId];
      });
      void queryClient.invalidateQueries({ queryKey: savedPostsQueryKey });
    },
  });

  const unsaveMutation = useMutation({
    mutationFn: async (postId: string) => {
      if (!user?.id) throw new Error("Not authenticated");
      const { error } = await (supabase as any)
        .from("saved_posts")
        .delete()
        .eq("user_id", user.id)
        .eq("post_id", postId);
      if (error) throw error;
      return postId;
    },
    onSuccess: (postId) => {
      queryClient.setQueryData<string[]>(savedIdsQueryKey, (prev) => (prev || []).filter((id) => id !== postId));
      void queryClient.invalidateQueries({ queryKey: savedPostsQueryKey });
    },
  });

  const savePost = useCallback(async (postId: string) => {
    await saveMutation.mutateAsync(postId);
  }, [saveMutation]);

  const unsavePost = useCallback(async (postId: string) => {
    await unsaveMutation.mutateAsync(postId);
  }, [unsaveMutation]);

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
    refetch: async () => {
      await savedIdsQuery.refetch();
    },
  };
}
