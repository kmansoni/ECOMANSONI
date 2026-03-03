import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BarChart2, CheckCircle2, XCircle } from "lucide-react";
import { usePolls, Poll } from "@/hooks/usePolls";

interface PollMessageProps {
  pollId: string;
  conversationId: string;
  isOwn?: boolean;
}

export function PollMessage({ pollId, conversationId, isOwn }: PollMessageProps) {
  const { loadPoll, vote, retractVote, closePoll, getPollResults } = usePolls(conversationId);
  const [poll, setPoll] = useState<Poll | null>(null);

  useEffect(() => {
    loadPoll(pollId).then((p) => {
      if (p) setPoll(p);
    });
  }, [pollId]);

  // Обновляем из store
  const stored = getPollResults(pollId);
  useEffect(() => {
    if (stored) setPoll(stored);
  }, [stored]);

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
        <span className="text-xs text-white/40">
          {totalVotes} {totalVotes === 1 ? "голос" : totalVotes < 5 ? "голоса" : "голосов"}
        </span>
        <div className="flex items-center gap-2">
          {!poll.is_anonymous && hasVoted && !poll.is_closed && (
            <button
              onClick={handleRetract}
              className="text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              Отозвать голос
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
    </div>
  );
}
