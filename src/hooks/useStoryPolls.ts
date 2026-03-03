import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type PollType = 'binary' | 'multiple' | 'slider' | 'quiz' | 'emoji';

export interface PollOption {
  text: string;
  emoji?: string;
}

export interface StoryPoll {
  id: string;
  story_id: string;
  question: string;
  poll_type: PollType;
  options: PollOption[];
  correct_option_index?: number;
  allow_multiple: boolean;
  created_at: string;
}

export interface PollVote {
  id: string;
  poll_id: string;
  user_id: string;
  option_index: number;
  slider_value?: number;
  created_at: string;
}

export interface PollResults {
  votes: PollVote[];
  totalVotes: number;
  percentages: number[];
  myVotes: number[];
  sliderAverage?: number;
}

export function useStoryPolls(storyId: string | null) {
  const { user } = useAuth();
  const [polls, setPolls] = useState<StoryPoll[]>([]);
  const [votes, setVotes] = useState<Record<string, PollVote[]>>({});
  const [loading, setLoading] = useState(false);

  const fetchPolls = useCallback(async () => {
    if (!storyId) return;
    setLoading(true);
    const { data: pollData } = await (supabase as any)
      .from('story_polls')
      .select('*')
      .eq('story_id', storyId);

    if (pollData) {
      setPolls(pollData as StoryPoll[]);

      const voteMap: Record<string, PollVote[]> = {};
      for (const poll of pollData) {
        const { data: voteData } = await (supabase as any)
          .from('story_poll_votes')
          .select('*')
          .eq('poll_id', poll.id);
        voteMap[poll.id] = (voteData || []) as PollVote[];
      }
      setVotes(voteMap);
    }
    setLoading(false);
  }, [storyId]);

  useEffect(() => {
    fetchPolls();
  }, [fetchPolls]);

  const createPoll = useCallback(async (
    sid: string,
    question: string,
    options: PollOption[],
    type: PollType = 'binary',
    correctOptionIndex?: number
  ) => {
    const { data, error } = await (supabase as any)
      .from('story_polls')
      .insert({
        story_id: sid,
        question,
        options: options as any,
        poll_type: type,
        correct_option_index: correctOptionIndex ?? null,
      })
      .select()
      .single();
    if (!error && data) {
      setPolls(prev => [...prev, data as StoryPoll]);
    }
    return data;
  }, []);

  const vote = useCallback(async (pollId: string, optionIndex: number, sliderValue?: number) => {
    if (!user) return;
    // Оптимистичное обновление
    const optimistic: PollVote = {
      id: crypto.randomUUID(),
      poll_id: pollId,
      user_id: user.id,
      option_index: optionIndex,
      slider_value: sliderValue,
      created_at: new Date().toISOString(),
    };
    setVotes(prev => ({
      ...prev,
      [pollId]: [
        ...(prev[pollId] || []).filter(v => v.user_id !== user.id || v.option_index !== optionIndex),
        optimistic,
      ],
    }));

    const { error } = await (supabase as any)
      .from('story_poll_votes')
      .upsert({
        poll_id: pollId,
        user_id: user.id,
        option_index: optionIndex,
        slider_value: sliderValue ?? null,
      });
    if (error) {
      fetchPolls();
    }
  }, [user, fetchPolls]);

  const getPollResults = useCallback((pollId: string): PollResults => {
    const pollVotes = votes[pollId] || [];
    const poll = polls.find(p => p.id === pollId);
    const optionCount = poll?.options?.length || 2;
    const totalVotes = pollVotes.length;
    const myVotes = user
      ? pollVotes.filter(v => v.user_id === user.id).map(v => v.option_index)
      : [];

    const counts = Array(optionCount).fill(0);
    pollVotes.forEach(v => {
      if (v.option_index < optionCount) counts[v.option_index]++;
    });
    const percentages = counts.map(c => totalVotes > 0 ? Math.round((c / totalVotes) * 100) : 0);

    const sliderVotes = pollVotes.filter(v => v.slider_value !== null && v.slider_value !== undefined);
    const sliderAverage = sliderVotes.length > 0
      ? sliderVotes.reduce((s, v) => s + (v.slider_value || 0), 0) / sliderVotes.length
      : undefined;

    return { votes: pollVotes, totalVotes, percentages, myVotes, sliderAverage };
  }, [votes, polls, user]);

  return {
    polls,
    votes,
    loading,
    createPoll,
    vote,
    getPollResults,
    refetch: fetchPolls,
  };
}
