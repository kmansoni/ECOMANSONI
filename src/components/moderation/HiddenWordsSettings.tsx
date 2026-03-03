/**
 * HiddenWordsSettings — UI настройки скрытых слов
 */
import React, { useState } from "react";
import { X, Plus, EyeOff, Shield } from "lucide-react";
import { useHiddenWords } from "@/hooks/useHiddenWords";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  hideOffensive?: boolean;
  onToggleHideOffensive?: (v: boolean) => void;
}

export function HiddenWordsSettings({ hideOffensive = false, onToggleHideOffensive }: Props) {
  const { words, loading, addWord, removeWord } = useHiddenWords();
  const [newWord, setNewWord] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!newWord.trim()) return;
    setAdding(true);
    await addWord(newWord);
    setNewWord("");
    setAdding(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Shield className="w-5 h-5 text-primary" />
        <div>
          <h3 className="text-white font-semibold">Скрытые слова</h3>
          <p className="text-xs text-white/50">Комментарии с этими словами будут скрыты</p>
        </div>
      </div>

      {/* Toggle скрытие оскорблений */}
      <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
        <div className="flex items-center gap-2">
          <EyeOff className="w-4 h-4 text-white/60" />
          <span className="text-sm text-white">Скрывать оскорбительные комментарии</span>
        </div>
        <button
          onClick={() => onToggleHideOffensive?.(!hideOffensive)}
          className={cn(
            "relative w-11 h-6 rounded-full transition-colors",
            hideOffensive ? "bg-primary" : "bg-white/20",
          )}
        >
          <div className={cn(
            "absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
            hideOffensive ? "translate-x-5.5" : "translate-x-0.5",
          )} style={{ transform: `translateX(${hideOffensive ? "22px" : "2px"})` }} />
        </button>
      </div>

      {/* Добавить слово */}
      <div className="flex gap-2">
        <Input
          value={newWord}
          onChange={(e) => setNewWord(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void handleAdd()}
          placeholder="Добавить слово..."
          className="bg-zinc-800 border-white/10 text-white flex-1"
          maxLength={50}
        />
        <Button
          onClick={handleAdd}
          disabled={adding || !newWord.trim()}
          size="sm"
          className="flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Список слов */}
      {loading ? (
        <p className="text-sm text-white/40 text-center py-3">Загрузка...</p>
      ) : words.length === 0 ? (
        <p className="text-sm text-white/40 text-center py-3 italic">Нет скрытых слов</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {words.map((w) => (
            <div
              key={w.id}
              className="flex items-center gap-1.5 bg-zinc-800 border border-white/10 rounded-full px-3 py-1 text-sm text-white"
            >
              <span>{w.word}</span>
              <button
                onClick={() => removeWord(w.id)}
                className="text-white/40 hover:text-red-400 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
