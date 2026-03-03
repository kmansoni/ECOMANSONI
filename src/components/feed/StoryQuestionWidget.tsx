import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface StoryQuestion {
  id: string;
  story_id: string;
  question_text: string;
  is_anonymous: boolean;
}

interface StoryQuestionWidgetProps {
  question: StoryQuestion;
  className?: string;
}

export function StoryQuestionWidget({ question, className }: StoryQuestionWidgetProps) {
  const { user } = useAuth();
  const [answer, setAnswer] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!answer.trim() || !user || loading) return;
    setLoading(true);
    const { error } = await (supabase as any)
      .from('story_question_answers')
      .insert({
        question_id: question.id,
        user_id: user.id,
        answer_text: answer.trim(),
      });
    if (!error) {
      setSent(true);
      setAnswer("");
    }
    setLoading(false);
  };

  return (
    <div className={cn("bg-gradient-to-br from-purple-600/80 to-pink-600/80 backdrop-blur-md rounded-2xl p-4", className)}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-white/80 text-xs">Вопрос</span>
        {question.is_anonymous && (
          <span className="text-white/60 text-xs bg-white/10 rounded-full px-2 py-0.5">анонимно</span>
        )}
      </div>
      <p className="text-white font-semibold text-base mb-3">{question.question_text}</p>

      <AnimatePresence mode="wait">
        {sent ? (
          <motion.div
            key="sent"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-2"
          >
            <p className="text-white font-medium">✓ Ответ отправлен!</p>
          </motion.div>
        ) : (
          <motion.div
            key="input"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 bg-white/20 rounded-full px-3 py-1"
          >
            <input
              type="text"
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Написать ответ..."
              className="flex-1 bg-transparent text-white placeholder-white/60 text-sm outline-none"
              maxLength={200}
              onClick={e => e.stopPropagation()}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSend();
              }}
              disabled={!answer.trim() || loading}
              className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 disabled:opacity-40 transition-colors"
            >
              <Send className="w-3.5 h-3.5 text-white" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
