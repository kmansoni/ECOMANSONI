import { useState } from "react";
import { Plus, Users } from "lucide-react";
import { motion } from "framer-motion";
import { dbLoose } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface AddYoursStickerProps {
  chainId: string;
  prompt: string;
  participantsCount: number;
  currentStoryId?: string;
  onParticipate?: () => void;
}

export function AddYoursSticker({
  chainId,
  prompt,
  participantsCount,
  currentStoryId,
  onParticipate,
}: AddYoursStickerProps) {
  const { user } = useAuth();
  const [count, setCount] = useState(participantsCount);
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleParticipate = async () => {
    if (!user || joined || !currentStoryId) return;
    setLoading(true);
    try {
      const { error } = await dbLoose
        .from("add_yours_entries")
        .insert({ chain_id: chainId, story_id: currentStoryId, user_id: user.id });
      if (!error) {
        await dbLoose
          .from("add_yours_chains")
          .update({ participants_count: count + 1 })
          .eq("id", chainId);
        setCount((c) => c + 1);
        setJoined(true);
        onParticipate?.();
        toast.success("Вы присоединились к цепочке!");
      }
    } catch {
      toast.error("Не удалось присоединиться");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3 max-w-[200px]"
    >
      <p className="text-white text-xs font-semibold mb-1 text-center">Добавь своё</p>
      <p className="text-white/80 text-xs text-center mb-2 line-clamp-2">{prompt}</p>
      <div className="flex items-center justify-center gap-1 mb-2">
        <Users className="w-3.5 h-3.5 text-white/60" />
        <span className="text-white/60 text-xs">{count} участников</span>
      </div>
      <button
        onClick={handleParticipate}
        disabled={joined || loading}
        className="w-full flex items-center justify-center gap-1 bg-white text-black text-xs font-semibold rounded-xl py-1.5 disabled:opacity-60"
      >
        <Plus className="w-3.5 h-3.5" />
        {joined ? "Добавлено" : "Добавить"}
      </button>
    </motion.div>
  );
}
