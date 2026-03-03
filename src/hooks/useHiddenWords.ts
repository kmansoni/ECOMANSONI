/**
 * useHiddenWords — управление скрытыми словами пользователя
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

const db = supabase as any;

interface HiddenWord {
  id: string;
  word: string;
  created_at: string;
}

export function useHiddenWords() {
  const [words, setWords] = useState<HiddenWord[]>([]);
  const [loading, setLoading] = useState(false);

  const getWords = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await db.from("user_hidden_words")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setWords((data || []) as HiddenWord[]);
    } finally {
      setLoading(false);
    }
  }, []);

  const addWord = useCallback(async (word: string) => {
    const trimmed = word.trim().toLowerCase();
    if (!trimmed) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await db.from("user_hidden_words")
      .insert({ user_id: user.id, word: trimmed })
      .select()
      .single();
    if (!error && data) setWords((prev) => [data as HiddenWord, ...prev]);
  }, []);

  const removeWord = useCallback(async (id: string) => {
    await db.from("user_hidden_words").delete().eq("id", id);
    setWords((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const checkText = useCallback((text: string): boolean => {
    if (!text || words.length === 0) return false;
    const lower = text.toLowerCase();
    return words.some((w) => lower.includes(w.word));
  }, [words]);

  useEffect(() => { void getWords(); }, [getWords]);

  return { words, loading, getWords, addWord, removeWord, checkText };
}
