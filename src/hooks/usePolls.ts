import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface PollOption {
  id: string;
  poll_id: string;
  option_text: string;
  option_index: number;
  voter_count: number;
}

export interface Poll {
  id: string;
  message_id: string | null;
  conversation_id: string;
  creator_id: string;
  question: string;
  poll_type: "regular" | "quiz" | "multiple";
  is_anonymous: boolean;
  allows_multiple: boolean;
  correct_option_index: number | null;
  close_date: string | null;
  is_closed: boolean;
  created_at: string;
  options: PollOption[];
  my_votes: string[]; // option ids
  total_votes: number;
}

export interface CreatePollInput {
  question: string;
  options: string[];
  poll_type?: "regular" | "quiz" | "multiple";
  is_anonymous?: boolean;
  allows_multiple?: boolean;
  correct_option_index?: number | null;
  close_date?: string | null;
}

export function usePolls(conversationId: string | null) {
  const { user } = useAuth();
  const [polls, setPolls] = useState<Record<string, Poll>>({});

  // Загрузить опросы по poll_id
  const loadPoll = useCallback(async (pollId: string): Promise<Poll | null> => {
    if (!user) return null;

    const pollRes = await (supabase as any).from("message_polls").select("*").eq("id", pollId).single();
    const optRes = await (supabase as any).from("poll_options").select("*").eq("poll_id", pollId).order("option_index");
    const voteRes = await (supabase as any).from("poll_votes").select("option_id").eq("poll_id", pollId).eq("user_id", user.id);

    if (pollRes.error || !pollRes.data) return null;

    const options: PollOption[] = optRes.data || [];
    const myVotes: string[] = (voteRes.data || []).map((v: any) => v.option_id);
    const totalVotes = options.reduce((sum: number, o: PollOption) => sum + (o.voter_count || 0), 0);

    const poll: Poll = {
      ...pollRes.data,
      options,
      my_votes: myVotes,
      total_votes: totalVotes,
    };

    setPolls((prev) => ({ ...prev, [pollId]: poll }));
    return poll;
  }, [user]);

  // Создать опрос и вернуть его id
  const createPoll = useCallback(
    async (input: CreatePollInput): Promise<string | null> => {
      if (!user || !conversationId) return null;

      const { data: poll, error } = await (supabase as any)
        .from("message_polls")
        .insert({
          conversation_id: conversationId,
          creator_id: user.id,
          question: input.question,
          poll_type: input.poll_type || "regular",
          is_anonymous: input.is_anonymous ?? false,
          allows_multiple: input.allows_multiple ?? false,
          correct_option_index: input.correct_option_index ?? null,
          close_date: input.close_date ?? null,
        })
        .select("id")
        .single();

      if (error || !poll) return null;

      // Добавить варианты
      const optionsData = input.options.map((text, i) => ({
        poll_id: poll.id,
        option_text: text,
        option_index: i,
        voter_count: 0,
      }));

      await (supabase as any).from("poll_options").insert(optionsData);

      await loadPoll(poll.id);
      return poll.id;
    },
    [user, conversationId, loadPoll]
  );

  // Голосовать
  const vote = useCallback(
    async (pollId: string, optionId: string) => {
      if (!user) return;
      await (supabase as any).rpc("vote_poll_v1", {
        p_poll_id: pollId,
        p_option_id: optionId,
        p_user_id: user.id,
      });
      await loadPoll(pollId);
    },
    [user, loadPoll]
  );

  // Отозвать голос
  const retractVote = useCallback(
    async (pollId: string) => {
      if (!user) return;
      const poll = polls[pollId];
      if (!poll) return;

      for (const optionId of poll.my_votes) {
        await (supabase as any)
          .from("poll_votes")
          .delete()
          .eq("poll_id", pollId)
          .eq("option_id", optionId)
          .eq("user_id", user.id);
        await (supabase as any)
          .from("poll_options")
          .update({ voter_count: Math.max(0, (poll.options.find((o) => o.id === optionId)?.voter_count || 1) - 1) })
          .eq("id", optionId);
      }
      await loadPoll(pollId);
    },
    [user, polls, loadPoll]
  );

  // Закрыть опрос
  const closePoll = useCallback(
    async (pollId: string) => {
      await (supabase as any)
        .from("message_polls")
        .update({ is_closed: true })
        .eq("id", pollId);
      await loadPoll(pollId);
    },
    [loadPoll]
  );

  const getPollResults = useCallback(
    (pollId: string) => polls[pollId] || null,
    [polls]
  );

  // Realtime подписка
  useEffect(() => {
    if (!conversationId) return;
    const channel = (supabase as any)
      .channel(`polls:${conversationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "poll_options" }, (payload: any) => {
        const pollId = payload.new?.poll_id || payload.old?.poll_id;
        if (pollId && polls[pollId]) {
          loadPoll(pollId);
        }
      })
      .subscribe();
    return () => {
      (supabase as any).removeChannel(channel);
    };
  }, [conversationId, polls, loadPoll]);

  return { createPoll, vote, retractVote, closePoll, getPollResults, loadPoll };
}
