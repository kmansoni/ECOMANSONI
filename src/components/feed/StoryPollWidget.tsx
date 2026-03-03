import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";
import { type StoryPoll, type PollResults } from "@/hooks/useStoryPolls";

interface StoryPollWidgetProps {
  poll: StoryPoll;
  results: PollResults;
  onVote: (optionIndex: number, sliderValue?: number) => void;
  className?: string;
}

export function StoryPollWidget({ poll, results, onVote, className }: StoryPollWidgetProps) {
  const [sliderVal, setSliderVal] = useState(50);
  const hasVoted = results.myVotes.length > 0;

  if (poll.poll_type === 'slider') {
    return (
      <div className={cn("bg-black/50 backdrop-blur-md rounded-2xl p-4 text-center", className)}>
        <p className="text-white font-semibold text-base mb-3">{poll.question}</p>
        {!hasVoted ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{poll.options[0]?.emoji || '😢'}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={sliderVal}
                onChange={e => setSliderVal(Number(e.target.value))}
                className="flex-1 accent-white"
              />
              <span className="text-2xl">{poll.options[1]?.emoji || '🔥'}</span>
            </div>
            <button
              onClick={() => onVote(0, sliderVal)}
              className="bg-white text-black rounded-full py-2 px-6 font-medium text-sm"
            >
              Ответить
            </button>
          </div>
        ) : (
          <div className="text-white/80 text-sm">
            <p>Средний ответ: {Math.round(results.sliderAverage || 0)}</p>
            <p className="text-white/60 text-xs mt-1">{results.totalVotes} голосов</p>
          </div>
        )}
      </div>
    );
  }

  const isBinary = poll.poll_type === 'binary';
  const isQuiz = poll.poll_type === 'quiz';

  return (
    <div className={cn("bg-black/50 backdrop-blur-md rounded-2xl p-4", className)}>
      <p className="text-white font-semibold text-base text-center mb-3">{poll.question}</p>
      <div className={cn(
        "flex gap-2",
        isBinary ? "flex-row" : "flex-col"
      )}>
        {poll.options.map((option, idx) => {
          const pct = results.percentages[idx] || 0;
          const isMyVote = results.myVotes.includes(idx);
          const isCorrect = isQuiz && poll.correct_option_index === idx;
          const isWrong = isQuiz && hasVoted && isMyVote && !isCorrect;

          return (
            <motion.button
              key={idx}
              onClick={() => !hasVoted && onVote(idx)}
              className={cn(
                "relative overflow-hidden rounded-xl py-3 px-4 text-left transition-all",
                isBinary ? "flex-1" : "w-full",
                hasVoted ? "cursor-default" : "cursor-pointer active:scale-95",
                isCorrect && hasVoted ? "ring-2 ring-green-400" : "",
                isWrong ? "ring-2 ring-red-400" : "",
                !hasVoted ? "bg-white/20 hover:bg-white/30" : "bg-white/10"
              )}
              whileTap={!hasVoted ? { scale: 0.97 } : {}}
            >
              {/* Полоса прогресса */}
              {hasVoted && (
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-xl",
                    isCorrect ? "bg-green-500/30" :
                    isWrong ? "bg-red-500/30" :
                    isMyVote ? "bg-white/30" : "bg-white/15"
                  )}
                />
              )}
              <div className="relative flex items-center justify-between">
                <span className="text-white text-sm font-medium">
                  {option.emoji ? `${option.emoji} ` : ''}{option.text}
                </span>
                <div className="flex items-center gap-1">
                  {isMyVote && !isQuiz && (
                    <div className="w-2 h-2 rounded-full bg-white" />
                  )}
                  {isCorrect && hasVoted && (
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                  )}
                  {hasVoted && (
                    <span className="text-white/80 text-xs font-semibold ml-1">{pct}%</span>
                  )}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
      {hasVoted && (
        <p className="text-white/50 text-xs text-center mt-2">{results.totalVotes} голосов</p>
      )}
    </div>
  );
}
