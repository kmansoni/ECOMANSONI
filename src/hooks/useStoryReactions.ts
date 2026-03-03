import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type ReactionType = 'like' | 'love' | 'laugh' | 'wow' | 'sad' | 'fire' | 'clap' | '100';

export interface StoryReaction {
  id: string;
  story_id: string;
  user_id: string;
  reaction_type: ReactionType;
  created_at: string;
}

export const REACTION_EMOJIS: Record<ReactionType, string> = {
  like: '👍',
  love: '❤️',
  laugh: '😂',
  wow: '😮',
  sad: '😢',
  fire: '🔥',
  clap: '👏',
  '100': '💯',
};

export function useStoryReactions(storyId: string | null) {
  const { user } = useAuth();
  const [reactions, setReactions] = useState<StoryReaction[]>([]);
  const [myReaction, setMyReaction] = useState<ReactionType | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchReactions = useCallback(async () => {
    if (!storyId) return;
    const { data, error } = await (supabase as any)
      .from('story_reactions')
      .select('*')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false });
    if (!error && data) {
      setReactions(data as StoryReaction[]);
      if (user) {
        const mine = data.find((r: StoryReaction) => r.user_id === user.id);
        setMyReaction(mine ? mine.reaction_type as ReactionType : null);
      }
    }
  }, [storyId, user]);

  useEffect(() => {
    fetchReactions();
  }, [fetchReactions]);

  const addReaction = useCallback(async (sid: string, type: ReactionType) => {
    if (!user) return;
    // Оптимистичное обновление
    const optimistic: StoryReaction = {
      id: crypto.randomUUID(),
      story_id: sid,
      user_id: user.id,
      reaction_type: type,
      created_at: new Date().toISOString(),
    };
    setReactions(prev => {
      const filtered = prev.filter(r => r.user_id !== user.id);
      return [optimistic, ...filtered];
    });
    setMyReaction(type);

    // Upsert в БД
    const { error } = await (supabase as any)
      .from('story_reactions')
      .upsert({ story_id: sid, user_id: user.id, reaction_type: type });
    if (error) {
      // Откат при ошибке
      fetchReactions();
    }
  }, [user, fetchReactions]);

  const removeReaction = useCallback(async (sid: string) => {
    if (!user) return;
    // Оптимистичное обновление
    setReactions(prev => prev.filter(r => r.user_id !== user.id));
    setMyReaction(null);

    const { error } = await (supabase as any)
      .from('story_reactions')
      .delete()
      .eq('story_id', sid)
      .eq('user_id', user.id);
    if (error) {
      fetchReactions();
    }
  }, [user, fetchReactions]);

  const reactionCounts = Object.keys(REACTION_EMOJIS).reduce((acc, type) => {
    acc[type as ReactionType] = reactions.filter(r => r.reaction_type === type).length;
    return acc;
  }, {} as Record<ReactionType, number>);

  return {
    reactions,
    myReaction,
    reactionCounts,
    loading,
    addReaction,
    removeReaction,
  };
}
