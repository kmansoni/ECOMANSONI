import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface StoryEmojiSliderProps {
  sliderId: string;
  emoji?: string;
  prompt?: string;
  averageValue?: number;
}

export function StoryEmojiSlider({
  sliderId,
  emoji = "😍",
  prompt = "Как вам?",
  averageValue = 0.5,
}: StoryEmojiSliderProps) {
  const { user } = useAuth();
  const [value, setValue] = useState(0.5);
  const [voted, setVoted] = useState(false);
  const [avg, setAvg] = useState(averageValue);
  const trackRef = useRef<HTMLDivElement>(null);

  const handleVote = async (v: number) => {
    if (voted || !user) return;
    setVoted(true);
    setValue(v);
    await (supabase as any)
      .from("story_emoji_slider_votes")
      .upsert({ slider_id: sliderId, user_id: user.id, value: v });
    // Update avg optimistically
    setAvg((avg + v) / 2);
  };

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (voted) return;
    const rect = trackRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const v = Math.max(0, Math.min(1, x / rect.width));
    handleVote(v);
  };

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 mx-2">
      {prompt && <p className="text-white text-sm font-semibold text-center mb-2">{prompt}</p>}
      <div
        ref={trackRef}
        onClick={handleTrackClick}
        className="relative h-10 bg-white/20 rounded-full cursor-pointer"
      >
        {/* Fill */}
        <div
          className="absolute inset-y-0 left-0 bg-white/30 rounded-full transition-all"
          style={{ width: `${(voted ? value : avg) * 100}%` }}
        />
        {/* Emoji thumb */}
        <motion.div
          animate={{ left: `calc(${(voted ? value : avg) * 100}% - 20px)` }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="absolute top-1/2 -translate-y-1/2 text-2xl select-none pointer-events-none"
        >
          {emoji}
        </motion.div>
      </div>
      {voted && (
        <p className="text-white/60 text-xs text-center mt-2">
          Среднее: {Math.round(avg * 100)}%
        </p>
      )}
    </div>
  );
}
