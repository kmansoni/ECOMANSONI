/**
 * src/components/chat/UserNoteInput.tsx — Sheet ввода мини-статуса (Note).
 *
 * Input до 60 символов + emoji picker + выбор аудитории.
 */

import { useState, useCallback } from "react";
import { X, Globe, Users } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserNotes } from "@/hooks/useUserNotes";

const MAX_NOTE_LENGTH = 60;

const EMOJI_PRESETS = ["💭", "📖", "🎵", "✈️", "😴", "🏋️", "🎮", "💼", "🎉", "❤️", "🔥", "✨"];

interface UserNoteInputProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserNoteInput({ open, onOpenChange }: UserNoteInputProps) {
  const { myNote, setNote, clearNote, loading } = useUserNotes();
  const [text, setText] = useState(myNote?.text ?? "");
  const [emoji, setEmoji] = useState(myNote?.emoji ?? "💭");
  const [audience, setAudience] = useState<"followers" | "close_friends">(
    (myNote?.audience as "followers" | "close_friends") ?? "followers",
  );

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    await setNote(trimmed, emoji, audience);
    onOpenChange(false);
  }, [text, emoji, audience, setNote, onOpenChange]);

  const handleClear = useCallback(async () => {
    await clearNote();
    setText("");
    onOpenChange(false);
  }, [clearNote, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-zinc-950 border-white/10">
        <SheetHeader>
          <SheetTitle className="text-white">Ваша заметка</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Превью */}
          <div className="flex items-center justify-center">
            <div className="bg-zinc-800 rounded-full px-4 py-2 flex items-center gap-2 max-w-[280px]">
              <span className="text-lg">{emoji}</span>
              <span className="text-sm text-white/70 truncate">
                {text.trim() || "Ваш статус..."}
              </span>
            </div>
          </div>

          {/* Input */}
          <div className="relative">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_NOTE_LENGTH))}
              placeholder="Чем занимаетесь?"
              maxLength={MAX_NOTE_LENGTH}
              className="bg-transparent border-white/10 text-white pr-12"
              autoFocus
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/30">
              {text.length}/{MAX_NOTE_LENGTH}
            </span>
          </div>

          {/* Emoji picker */}
          <div className="flex flex-wrap gap-2">
            {EMOJI_PRESETS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all ${
                  emoji === e
                    ? "bg-blue-500/30 ring-2 ring-blue-400"
                    : "bg-white/5 hover:bg-white/10"
                }`}
                aria-label={`Выбрать эмодзи ${e}`}
              >
                {e}
              </button>
            ))}
          </div>

          {/* Аудитория */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAudience("followers")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm transition-all min-h-[44px] ${
                audience === "followers"
                  ? "bg-blue-500/20 text-blue-300 border border-blue-400/30"
                  : "bg-white/5 text-white/50 border border-white/10"
              }`}
            >
              <Globe className="w-4 h-4" />
              Подписчики
            </button>
            <button
              type="button"
              onClick={() => setAudience("close_friends")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm transition-all min-h-[44px] ${
                audience === "close_friends"
                  ? "bg-green-500/20 text-green-300 border border-green-400/30"
                  : "bg-white/5 text-white/50 border border-white/10"
              }`}
            >
              <Users className="w-4 h-4" />
              Близкие друзья
            </button>
          </div>

          {/* Кнопки */}
          <div className="flex gap-2">
            {myNote && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                disabled={loading}
                className="border-red-400/30 text-red-400 hover:bg-red-500/10"
              >
                <X className="w-4 h-4 mr-1" />
                Удалить
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={loading || !text.trim()}
              className="flex-1"
            >
              {loading ? "Сохранение..." : "Поделиться"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
