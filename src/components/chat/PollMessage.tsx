import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { BarChart2, CheckCircle2, XCircle, TrendingUp, Users } from "lucide-react";
import { usePolls, Poll } from "@/hooks/usePolls";
import { supabase } from "@/integrations/supabase/client";

interface PollMessageProps {
  pollId: string;
  conversationId: string;
  isOwn?: boolean;
  isAdmin?: boolean; // Can see poll statistics
}

interface PollVoteHistory {
  option_id: string;
  created_at: string;
}

export function PollMessage({ pollId, conversationId, isOwn, isAdmin }: PollMessageProps) {
  const { loadPoll, vote, retractVote, closePoll, getPollResults } = usePolls(conversationId);
  const [poll, setPoll] = useState<Poll | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [voteHistory, setVoteHistory] = useState<PollVoteHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Load poll
  useEffect(() => {
    loadPoll(pollId).then((p) => {
      if (p) setPoll(p);
    });
  }, [pollId, loadPoll]);

  // Обновляем из store
  const stored = getPollResults(pollId);
  useEffect(() => {
    if (stored) setPoll(stored);
  }, [stored]);

  // Load vote history for admin statistics
  useEffect(() => {
    if (!isAdmin || !poll?.id || !showStats) return;
    setLoadingHistory(true);
    supabase
      .from("poll_votes")
      .select("option_id, created_at")
      .eq("poll_id", poll.id)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error || !data) {
          setVoteHistory([]);
        } else {
          setVoteHistory((data as unknown as PollVoteHistory[]) || []);
        }
        setLoadingHistory(false);
      });
  }, [isAdmin, poll?.id, showStats]);

  if (!poll) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-3 w-64 animate-pulse">
        <div className="h-4 bg-white/10 rounded w-3/4 mb-2" />
        <div className="h-3 bg-white/10 rounded w-1/2" />
      </div>
    );
  }

  const hasVoted = poll.my_votes.length > 0 || poll.is_closed;
  const totalVotes = poll.total_votes || 0;

  const handleVote = async (optionId: string) => {
    if (poll.is_closed) return;
    await vote(pollId, optionId);
  };

  const handleRetract = async () => {
    if (poll.is_anonymous || poll.is_closed) return;
    await retractVote(pollId);
  };

  const wrapCls = isOwn
    ? "bg-blue-600/20 border-blue-500/30"
    : "bg-white/5 border-white/10";

  return (
    <div className={`rounded-2xl border p-3 w-72 max-w-sm ${wrapCls}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 className="w-4 h-4 text-blue-400 shrink-0" />
        <div>
          <p className="text-[10px] text-white/40 uppercase tracking-wide font-medium">
            {poll.is_closed ? "Опрос завершён" : poll.poll_type === "quiz" ? "Викторина" : "Опрос"}
            {poll.is_anonymous ? " · Анонимный" : ""}
          </p>
          <p className="text-sm font-medium text-white leading-snug">{poll.question}</p>
        </div>
      </div>

      {/* Options */}
      <div className="space-y-2">
        {poll.options.map((option) => {
          const isSelected = poll.my_votes.includes(option.id);
          const isCorrect = poll.poll_type === "quiz" && option.option_index === poll.correct_option_index;
          const percent = totalVotes > 0 ? Math.round((option.voter_count / totalVotes) * 100) : 0;

          if (!hasVoted && !poll.is_closed) {
            // До голосования — кнопки
            return (
              <button
                key={option.id}
                onClick={() => handleVote(option.id)}
                className="w-full text-left px-3 py-2 rounded-xl border border-white/10 hover:border-white/25 hover:bg-white/5 transition-colors"
              >
                <span className="text-sm text-white">{option.option_text}</span>
              </button>
            );
          }

          // После голосования — прогресс-бары
          let barColor = "bg-white/20";
          if (isSelected) barColor = "bg-blue-500";
          if (isCorrect) barColor = "bg-emerald-500";

          let textColor = "text-white/70";
          if (isSelected) textColor = "text-blue-300";
          if (isCorrect) textColor = "text-emerald-300";

          return (
            <div
              key={option.id}
              onClick={() => !poll.is_closed && handleVote(option.id)}
              className={`relative rounded-xl overflow-hidden px-3 py-2 cursor-pointer ${
                poll.is_closed ? "cursor-default" : "hover:bg-white/5"
              }`}
            >
              {/* Background bar */}
              <motion.div
                className={`absolute inset-0 rounded-xl origin-left ${barColor} opacity-25`}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: percent / 100 }}
                transition={{ type: "spring", stiffness: 120, damping: 20 }}
                style={{ transformOrigin: "left" }}
              />
              <div className="relative flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {isSelected && !isCorrect && <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                  {isCorrect && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                  {poll.poll_type === "quiz" && !isCorrect && hasVoted && isSelected && (
                    <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  )}
                  <span className={`text-sm truncate ${textColor}`}>{option.option_text}</span>
                </div>
                <span className={`text-xs font-medium shrink-0 ${textColor}`}>{percent}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40">
            {totalVotes} {totalVotes === 1 ? "голос" : totalVotes < 5 ? "голоса" : "голосов"}
          </span>
          {!poll.is_anonymous && hasVoted && !poll.is_closed && poll.poll_type !== "quiz" && (
            <button
             onClick={handleRetract}
              className="text-xs text-white/40 hover:text-white/70 transition-colors ml-2"
            >
              Отозвать голос
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && !poll.is_closed && (
            <button
              onClick={() => setShowStats(!showStats)}
              className="flex items-center gap-1 text-xs text-blue-400/70 hover:text-blue-400 transition-colors"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              {showStats ? "Скрыть график" : "График"}
            </button>
          )}
          {isOwn && !poll.is_closed && (
            <button
              onClick={() => closePoll(pollId)}
              className="text-xs text-white/40 hover:text-red-400 transition-colors"
            >
              Завершить
            </button>
          )}
        </div>
      </div>

      {/* Poll Statistics Graph — Telegram May 2026 feature */}
      {showStats && isAdmin && (
        <PollStatisticsGraph
          pollId={pollId}
          totalVotes={totalVotes}
          options={poll.options}
          voteHistory={voteHistory}
          loading={loadingHistory}
        />
      )}
    </div>
  );
}

// ── Poll Statistics Graph Component ─────────────────────────────

interface PollStatisticsGraphProps {
  pollId: string;
  totalVotes: number;
  options: Poll["options"];
  voteHistory: PollVoteHistory[];
  loading: boolean;
}

function PollStatisticsGraph({ totalVotes, options, voteHistory, loading }: PollStatisticsGraphProps) {
  // Build hourly vote distribution
  const hourlyData = useMemo(() => {
    if (!voteHistory.length) return [];
    
    const buckets = new Map<string, { votes: number; timeLabel: string }>();
    const now = new Date();
    
    for (let i = 12; i >= 0; i--) {
      const hour = new Date(now.getTime() - i * 3600000);
      const label = `${hour.getHours().toString().padStart(2, '0')}:00`;
      buckets.set(label, { votes: 0, timeLabel: label });
    }

    for (const vote of voteHistory) {
      const date = new Date(vote.created_at);
      const label = `${date.getHours().toString().padStart(2, '0')}:00`;
      const bucket = buckets.get(label);
      if (bucket) bucket.votes++;
    }

    return Array.from(buckets.values());
  }, [voteHistory]);

  const maxVotesInHour = Math.max(...hourlyData.map(b => b.votes), 1);

  if (loading) {
    return (
      <div className="mt-3 pt-3 border-t border-white/10">
        <div className="flex items-center gap-2 text-xs text-white/40">
          <TrendingUp className="w-3.5 h-3.5 animate-pulse" />
          Загрузка статистики...
        </div>
      </div>
    );
  }

  if (!totalVotes) {
    return (
      <div className="mt-3 pt-3 border-t border-white/10">
        <p className="text-xs text-white/40">Пока нет голосов</p>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-white/10 space-y-3">
      {/* Per-option breakdown */}
      <div className="space-y-1.5">
        {options.map((option) => {
          const percent = totalVotes > 0 ? Math.round((option.voter_count / totalVotes) * 100) : 0;
          return (
            <div key={option.id} className="flex items-center gap-2">
              <span className="text-xs text-white/60 w-2">{option.option_index + 1}</span>
              <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-blue-500/60 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${percent}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 20 }}
                />
              </div>
              <span className="text-xs text-white/40 w-8 text-right">{percent}%</span>
            </div>
          );
        })}
      </div>

      {/* Hourly vote distribution (simple bar chart) */}
      {voteHistory.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] text-white/30 uppercase tracking-wide">
            <BarChart2 className="w-3 h-3" />
            Активность по времени
          </div>
          <div className="flex items-end gap-0.5 h-8">
            {hourlyData.map((bucket, i) => (
              <div
                key={i}
                className="flex-1 flex flex-col items-center gap-0.5"
              >
                <div
                  className="w-full bg-blue-500/40 rounded-t transition-all"
                  style={{ height: `${(bucket.votes / maxVotesInHour) * 100}%`, minHeight: bucket.votes > 0 ? 2 : 0 }}
                />
                {i % 3 === 0 && (
                  <span className="text-[8px] text-white/20">{bucket.timeLabel.slice(0, 2)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
