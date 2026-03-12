/**
 * @file src/components/profile/ProfileNote.tsx
 * @description Instagram Notes — короткая заметка (до 60 символов) на аватаре профиля.
 * Видна подписчикам 24 часа. Аналог Instagram Notes 2023+.
 *
 * Архитектура:
 * - Одна активная заметка на пользователя (UNIQUE constraint)
 * - TTL: expires_at = now() + 24h (server-side)
 * - Аудитория: followers | close_friends
 * - Отображается как bubble над аватаром в Stories row
 * - Автоматически исчезает после expires_at
 */

import { useState } from "react";
import { MessageCircle, X, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface ProfileNoteData {
  id: string;
  user_id: string;
  text: string;
  audience: "followers" | "close_friends";
  expires_at: string;
}

interface ProfileNoteProps {
  note: ProfileNoteData | null;
  isOwner: boolean;
  onRefresh: () => void;
}

const MAX_CHARS = 60;

export function ProfileNote({ note, isOwner, onRefresh }: ProfileNoteProps) {
  const { user } = useAuth();
  const [showSheet, setShowSheet] = useState(false);
  const [text, setText] = useState(note?.text ?? "");
  const [audience, setAudience] = useState<"followers" | "close_friends">(
    note?.audience ?? "followers"
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isExpired = note ? new Date(note.expires_at) < new Date() : true;
  const activeNote = note && !isExpired ? note : null;

  const handleSave = async () => {
    if (!user || !text.trim()) return;
    setIsSubmitting(true);
    const db = supabase as any;
    try {
      // Upsert — одна заметка на пользователя
      const { error } = await db.from("profile_notes").upsert(
        {
          user_id: user.id,
          text: text.trim(),
          audience,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;
      toast.success("Заметка опубликована");
      setShowSheet(false);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    const db = supabase as any;
    const { error } = await db
      .from("profile_notes")
      .delete()
      .eq("user_id", user.id);
    if (error) { toast.error("Ошибка удаления"); return; }
    setText("");
    toast.success("Заметка удалена");
    setShowSheet(false);
    onRefresh();
  };

  return (
    <>
      {/* Note bubble — отображается над аватаром */}
      {activeNote && (
        <button
          onClick={() => isOwner && setShowSheet(true)}
          className="relative"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className={cn(
              "absolute -top-8 left-1/2 -translate-x-1/2 z-10",
              "bg-card border border-border rounded-2xl rounded-bl-sm",
              "px-3 py-1.5 shadow-md max-w-[140px]",
              "text-xs text-center leading-tight"
            )}
          >
            {activeNote.text}
            {/* Хвостик */}
            <div className="absolute -bottom-1.5 left-4 w-3 h-3 bg-card border-b border-l border-border rotate-45" />
          </motion.div>
        </button>
      )}

      {/* Кнопка добавления заметки для владельца */}
      {isOwner && !activeNote && (
        <button
          onClick={() => setShowSheet(true)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          <span>Заметка</span>
        </button>
      )}

      {/* Sheet редактирования */}
      <Sheet open={showSheet} onOpenChange={setShowSheet}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Заметка</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 mt-4">
            <div className="relative">
              <Textarea
                placeholder="Что у вас нового?"
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
                className="resize-none min-h-[80px] pr-12"
                maxLength={MAX_CHARS}
              />
              <span className={cn(
                "absolute bottom-2 right-3 text-xs",
                text.length >= MAX_CHARS ? "text-destructive" : "text-muted-foreground"
              )}>
                {text.length}/{MAX_CHARS}
              </span>
            </div>

            {/* Аудитория */}
            <div className="flex gap-2">
              <button
                onClick={() => setAudience("followers")}
                className={cn(
                  "flex-1 py-2 rounded-xl text-sm font-medium border transition-colors",
                  audience === "followers"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground"
                )}
              >
                Подписчики
              </button>
              <button
                onClick={() => setAudience("close_friends")}
                className={cn(
                  "flex-1 py-2 rounded-xl text-sm font-medium border transition-colors",
                  audience === "close_friends"
                    ? "bg-green-500 text-white border-green-500"
                    : "border-border text-muted-foreground"
                )}
              >
                Близкие друзья
              </button>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Заметка исчезнет через 24 часа
            </p>

            <div className="flex gap-3">
              {activeNote && (
                <Button variant="destructive" onClick={handleDelete} className="flex-1">
                  Удалить
                </Button>
              )}
              <Button
                onClick={handleSave}
                disabled={!text.trim() || isSubmitting}
                className="flex-1"
              >
                {isSubmitting ? "Публикация..." : "Опубликовать"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
