import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useStoryReactions, REACTION_EMOJIS, type ReactionType } from "@/hooks/useStoryReactions";

interface StoryReactionBarProps {
  storyId: string;
  className?: string;
}

const REACTION_TYPES = Object.keys(REACTION_EMOJIS) as ReactionType[];

export function StoryReactionBar({ storyId, className }: StoryReactionBarProps) {
  const { myReaction, reactionCounts, addReaction, removeReaction } = useStoryReactions(storyId);

  const handleReaction = (type: ReactionType) => {
    if (myReaction === type) {
      removeReaction(storyId);
    } else {
      addReaction(storyId, type);
    }
  };

  const totalReactions = Object.values(reactionCounts).reduce((a, b) => a + b, 0);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Счётчик реакций */}
      <AnimatePresence>
        {totalReactions > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="flex items-center justify-center gap-1 flex-wrap"
          >
            {REACTION_TYPES.filter(t => reactionCounts[t] > 0).map(type => (
              <span key={type} className="text-white/80 text-xs bg-black/30 rounded-full px-2 py-0.5">
                {REACTION_EMOJIS[type]} {reactionCounts[type]}
              </span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Панель реакций */}
      <div className="flex items-center justify-center gap-3 bg-black/40 backdrop-blur-sm rounded-full px-4 py-2">
        {REACTION_TYPES.map(type => (
          <motion.button
            key={type}
            whileTap={{ scale: 1.5 }}
            animate={myReaction === type ? {
              scale: [1, 1.4, 1],
              transition: { duration: 0.3 }
            } : { scale: 1 }}
            onClick={(e) => {
              e.stopPropagation();
              handleReaction(type);
            }}
            className={cn(
              "text-2xl transition-all duration-150 select-none",
              myReaction === type
                ? "drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                : "opacity-70 hover:opacity-100"
            )}
            aria-label={`Реакция ${type}`}
          >
            {REACTION_EMOJIS[type]}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
