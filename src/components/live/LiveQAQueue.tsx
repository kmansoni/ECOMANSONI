/**
 * LiveQAQueue — очередь вопросов от зрителей
 */
import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Pin, Check, MessageCircleQuestion } from "lucide-react";
import { toast } from "sonner";


interface Question {
  id: string;
  session_id: string;
  user_id: string;
  question: string;
  is_answered: boolean;
  is_pinned: boolean;
  created_at: string;
  // joined
  author_name?: string;
  author_avatar?: string;
}

interface Props {
  sessionId: string;
  isStreamer?: boolean;
}

export function LiveQAQueue({ sessionId, isStreamer = false }: Props) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [newQuestion, setNewQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("live_questions")
      .select("*")
      .eq("session_id", sessionId)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: true });
    setQuestions((data || []) as Question[]);
  }, [sessionId]);

  useEffect(() => {
    void load();
    const sub = supabase
      .channel(`live_qa:${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_questions", filter: `session_id=eq.${sessionId}` },
        () => void load())
      .subscribe();
    return () => { sub.unsubscribe(); };
  }, [sessionId, load]);

  const askQuestion = async () => {
    if (!newQuestion.trim() || submitting) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Войдите для отправки вопроса"); return; }
      await supabase.from("live_questions").insert({
        session_id: sessionId,
        user_id: user.id,
        question: newQuestion.trim(),
      });
      setNewQuestion("");
      toast.success("Вопрос отправлен");
    } catch { toast.error("Ошибка отправки"); }
    finally { setSubmitting(false); }
  };

  const markAnswered = async (id: string) => {
    await supabase.from("live_questions").update({ is_answered: true }).eq("id", id);
    setQuestions((prev) => prev.map((q) => q.id === id ? { ...q, is_answered: true } : q));
  };

  const togglePin = async (id: string, pinned: boolean) => {
    await supabase.from("live_questions").update({ is_pinned: !pinned }).eq("id", id);
    await load();
  };

  const unanswered = questions.filter((q) => !q.is_answered);
  const answered = questions.filter((q) => q.is_answered);

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center gap-2 px-3 pt-2">
        <MessageCircleQuestion className="w-5 h-5 text-primary" />
        <span className="text-white font-semibold text-sm">Вопросы ({unanswered.length})</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 px-3 pb-2">
        {unanswered.length === 0 && (
          <p className="text-white/40 text-sm text-center py-4">Вопросов пока нет</p>
        )}
        {unanswered.map((q) => (
          <div key={q.id} className={cn(
            "rounded-xl p-3 text-sm",
            q.is_pinned ? "bg-primary/20 border border-primary/30" : "bg-white/5 border border-white/10",
          )}>
            <p className="text-white">{q.question}</p>
            {isStreamer && (
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => markAnswered(q.id)}
                  className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300"
                >
                  <Check className="w-3.5 h-3.5" /> Ответил
                </button>
                <button
                  onClick={() => togglePin(q.id, q.is_pinned)}
                  className={cn("flex items-center gap-1 text-xs", q.is_pinned ? "text-primary" : "text-white/50 hover:text-white")}
                >
                  <Pin className="w-3.5 h-3.5" /> {q.is_pinned ? "Откреплён" : "Закрепить"}
                </button>
              </div>
            )}
          </div>
        ))}
        {answered.length > 0 && (
          <div className="opacity-40 space-y-1">
            <p className="text-xs text-white/40 uppercase tracking-wider">Отвечено ({answered.length})</p>
            {answered.map((q) => (
              <div key={q.id} className="bg-white/5 rounded-xl p-2 text-xs text-white/60 line-through">
                {q.question}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Поле ввода вопроса */}
      <div className="flex gap-2 px-3 pb-3">
        <input
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void askQuestion()}
          placeholder="Задать вопрос..."
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-primary"
        />
        <button
          onClick={askQuestion}
          disabled={submitting || !newQuestion.trim()}
          className="px-3 py-2 bg-primary rounded-xl text-white text-sm disabled:opacity-50"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
