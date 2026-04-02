/**
 * src/components/chat/QuickRepliesSheet.tsx — Sheet управления быстрыми ответами.
 *
 * Список шаблонов с возможностью добавить, удалить, редактировать.
 */

import { useState, useCallback } from "react";
import { Plus, Trash2, GripVertical, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuickReplies } from "@/hooks/useQuickReplies";
import { Skeleton } from "@/components/ui/skeleton";

interface QuickRepliesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickRepliesSheet({ open, onOpenChange }: QuickRepliesSheetProps) {
  const { replies, add, remove, loading } = useQuickReplies();
  const [adding, setAdding] = useState(false);
  const [newShortcut, setNewShortcut] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newText, setNewText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleAdd = useCallback(async () => {
    const shortcut = newShortcut.trim();
    const title = newTitle.trim();
    const text = newText.trim();

    if (!shortcut || !title || !text) return;

    setSubmitting(true);
    try {
      await add(shortcut.startsWith("/") ? shortcut : `/${shortcut}`, title, text);
      setNewShortcut("");
      setNewTitle("");
      setNewText("");
      setAdding(false);
    } finally {
      setSubmitting(false);
    }
  }, [newShortcut, newTitle, newText, add]);

  const handleRemove = useCallback(
    async (id: string) => {
      await remove(id);
    },
    [remove],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-zinc-950 border-white/10 max-h-[80vh]">
        <SheetHeader>
          <SheetTitle className="text-white">Быстрые ответы</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-2 overflow-y-auto max-h-[50vh] pr-1">
          {loading && (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          )}

          {!loading && replies.length === 0 && !adding && (
            <p className="text-sm text-white/40 text-center py-8">
              Нет шаблонов. Добавьте первый быстрый ответ.
            </p>
          )}

          {replies.map((reply) => (
            <div
              key={reply.id}
              className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2.5 group"
            >
              <GripVertical className="w-4 h-4 text-white/20 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-cyan-400 font-mono">{reply.shortcut}</span>
                  <span className="text-sm text-white/80 font-medium truncate">{reply.title}</span>
                </div>
                <p className="text-xs text-white/40 truncate">{reply.text}</p>
              </div>
              <button
                onClick={() => handleRemove(reply.id)}
                className="shrink-0 p-1.5 rounded-lg hover:bg-red-500/20 opacity-0 group-hover:opacity-100 transition-all min-w-[36px] min-h-[36px] flex items-center justify-center"
                aria-label={`Удалить шаблон ${reply.title}`}
                type="button"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
              </button>
            </div>
          ))}

          {/* Форма добавления */}
          {adding && (
            <div className="bg-white/5 rounded-xl p-3 space-y-2 border border-white/10">
              <div className="flex items-center gap-2">
                <Input
                  value={newShortcut}
                  onChange={(e) => setNewShortcut(e.target.value)}
                  placeholder="/команда"
                  maxLength={20}
                  className="flex-1 bg-transparent border-white/10 text-white text-sm"
                  autoFocus
                />
                <button
                  onClick={() => setAdding(false)}
                  className="p-1 rounded-md hover:bg-white/10"
                  aria-label="Отмена"
                  type="button"
                >
                  <X className="w-4 h-4 text-white/40" />
                </button>
              </div>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Название"
                maxLength={50}
                className="bg-transparent border-white/10 text-white text-sm"
              />
              <Input
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="Текст ответа"
                maxLength={500}
                className="bg-transparent border-white/10 text-white text-sm"
              />
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={submitting || !newShortcut.trim() || !newTitle.trim() || !newText.trim()}
                className="w-full"
              >
                {submitting ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          )}
        </div>

        {!adding && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAdding(true)}
            className="mt-3 w-full border-dashed border-white/20 text-white/60 hover:text-white"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Добавить шаблон
          </Button>
        )}
      </SheetContent>
    </Sheet>
  );
}
