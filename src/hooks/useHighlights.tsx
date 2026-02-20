import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface StoryHighlight {
  id: string;
  user_id: string;
  title: string;
  cover_url: string;
  position: number;
  is_visible: boolean;
  privacy_level: 'public' | 'followers' | 'private';
  created_at: string;
  updated_at: string;
  stories?: HighlightStory[];
}

export interface HighlightStory {
  id: string;
  highlight_id: string;
  story_id: string;
  position: number;
  added_at: string;
  story?: {
    id: string;
    media_url: string;
    media_type: string;
    caption: string | null;
    created_at: string;
  };
}

export function useHighlights(userId?: string) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;
  
  const [highlights, setHighlights] = useState<StoryHighlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHighlights = useCallback(async () => {
    if (!targetUserId) {
      setHighlights([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await (supabase as any)
        .from('story_highlights')
        .select(`
          *,
          highlight_stories (
            *,
            story:stories (
              id,
              media_url,
              media_type,
              caption,
              created_at
            )
          )
        `)
        .eq('user_id', targetUserId)
        .eq('is_visible', true)
        .order('position', { ascending: true });

      if (fetchError) throw fetchError;

      // Сортируем stories внутри каждого highlight
      const highlightsWithSortedStories = (data || []).map(highlight => ({
        ...highlight,
        stories: (highlight.highlight_stories || [])
          .sort((a: any, b: any) => a.position - b.position)
      }));

      setHighlights(highlightsWithSortedStories as any);
    } catch (err) {
      console.error('Error fetching highlights:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch highlights');
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  const createHighlight = useCallback(async (
    title: string,
    coverUrl: string,
    privacyLevel: 'public' | 'followers' | 'private' = 'public'
  ) => {
    if (!user?.id) throw new Error('Not authenticated');

    const { data, error } = await (supabase as any)
      .from('story_highlights')
      .insert({
        user_id: user.id,
        title,
        cover_url: coverUrl,
        privacy_level: privacyLevel,
        position: highlights.length
      })
      .select()
      .single();

    if (error) throw error;

    await fetchHighlights();
    return data;
  }, [user?.id, highlights.length, fetchHighlights]);

  const updateHighlight = useCallback(async (
    highlightId: string,
    updates: Partial<Pick<StoryHighlight, 'title' | 'cover_url' | 'privacy_level' | 'is_visible'>>
  ) => {
    const { data, error } = await (supabase as any)
      .from('story_highlights')
      .update(updates)
      .eq('id', highlightId)
      .eq('user_id', user?.id)
      .select()
      .single();

    if (error) throw error;

    await fetchHighlights();
    return data;
  }, [user?.id, fetchHighlights]);

  const deleteHighlight = useCallback(async (highlightId: string) => {
    const { error } = await (supabase as any)
      .from('story_highlights')
      .delete()
      .eq('id', highlightId)
      .eq('user_id', user?.id);

    if (error) throw error;

    await fetchHighlights();
  }, [user?.id, fetchHighlights]);

  const addStoryToHighlight = useCallback(async (
    highlightId: string,
    storyId: string
  ) => {
    // Получаем текущее количество stories в highlight
    const { data: existingStories } = await (supabase as any)
      .from('highlight_stories')
      .select('position')
      .eq('highlight_id', highlightId)
      .order('position', { ascending: false })
      .limit(1);

    const nextPosition = (existingStories?.[0]?.position ?? 0) + 1;

    const { data, error } = await (supabase as any)
      .from('highlight_stories')
      .insert({
        highlight_id: highlightId,
        story_id: storyId,
        position: nextPosition
      })
      .select()
      .single();

    if (error) throw error;

    await fetchHighlights();
    return data;
  }, [fetchHighlights]);

  const removeStoryFromHighlight = useCallback(async (
    highlightId: string,
    storyId: string
  ) => {
    const { error } = await (supabase as any)
      .from('highlight_stories')
      .delete()
      .eq('highlight_id', highlightId)
      .eq('story_id', storyId);

    if (error) throw error;

    await fetchHighlights();
  }, [fetchHighlights]);

  const reorderHighlights = useCallback(async (
    highlightIds: string[]
  ) => {
    const updates = highlightIds.map((id, index) => ({
      id,
      position: index
    }));

    for (const update of updates) {
      await (supabase as any)
        .from('story_highlights')
        .update({ position: update.position })
        .eq('id', update.id)
        .eq('user_id', user?.id);
    }

    await fetchHighlights();
  }, [user?.id, fetchHighlights]);

  useEffect(() => {
    fetchHighlights();
  }, [fetchHighlights]);

  return {
    highlights,
    loading,
    error,
    createHighlight,
    updateHighlight,
    deleteHighlight,
    addStoryToHighlight,
    removeStoryFromHighlight,
    reorderHighlights,
    refetch: fetchHighlights
  };
}
