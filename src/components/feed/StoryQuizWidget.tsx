import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface StoryQuizWidgetProps {
  quizId: string;
  question: string;
  options: string[];
  correctIndex: number;
}

export function StoryQuizWidget({ quizId, question, options, correctIndex }: StoryQuizWidgetProps) {
  const { user } = useAuth();
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);

  const handleAnswer = async (index: number) => {
    if (answered || !user) return;
    setSelected(index);
    setAnswered(true);
    await (supabase as any)
      .from("story_quiz_answers")
      .upsert({ quiz_id: quizId, user_id: user.id, selected_index: index });
  };

  const getOptionStyle = (index: number) => {
    if (!answered) return "bg-white/20 border-white/30 text-white";
    if (index === correctIndex) return "bg-green-500 border-green-400 text-white";
    if (index === selected && index !== correctIndex) return "bg-red-500 border-red-400 text-white";
    return "bg-white/10 border-white/20 text-white/60";
  };

  return (
    <div className="bg-black/40 backdrop-blur-md rounded-2xl p-3 mx-2">
      <p className="text-white text-sm font-semibold text-center mb-3">{question}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt, i) => (
          <motion.button
            key={i}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleAnswer(i)}
            className={`border rounded-xl py-2 px-3 text-sm font-medium transition-all ${getOptionStyle(i)}`}
          >
            {opt}
            {answered && i === correctIndex && " ✓"}
          </motion.button>
        ))}
      </div>
      <AnimatePresence>
        {answered && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`text-xs text-center mt-2 font-medium ${selected === correctIndex ? "text-green-400" : "text-red-400"}`}
          >
            {selected === correctIndex ? "Правильно! 🎉" : "Неверно 😔"}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
