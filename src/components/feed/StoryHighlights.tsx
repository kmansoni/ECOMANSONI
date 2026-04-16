/**
 * @file src/components/feed/StoryHighlights.tsx
 * @description Instagram-style Story Highlights — закреплённые коллекции историй на профиле.
 *
 * Архитектура:
 * - Горизонтальный скролл кружков под шапкой профиля
 * - Создание highlight из архива историй
 * - Редактирование названия и обложки
 * - Просмотр highlight как обычных Stories
 * - RLS: владелец управляет, все видят публичные
 */

import { useState, useRef } from "react";
import { Plus, Pencil, X, Check, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface Highlight {
  id: string;
  user_id: string;
  title: string;
  cover_url: string | null;
  story_ids: string[];
  created_at: string;
}

interface StoryHighlightsProps {
  userId: string;
  isOwner: boolean;
  highlights: Highlight[];
  onHighlightPress: (highlight: Highlight) => void;
  onRefresh: () => void;
}

export function StoryHighlights({
  userId,
  isOwner,
  highlights,
  onHighlightPress,
  onRefresh,
}: StoryHighlightsProps) {
  const { user } = useAuth();
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [editingHighlight, setEditingHighlight] = useState<Highlight | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const handleCreate = async () => {
    if (!newTitle.trim() || !user) return;
    setIsSubmitting(true);
    try {
      let coverUrl: string | null = null;
      if (coverFile) {
        const ext = coverFile.name.split(".").pop();
        const path = `highlights/${user.id}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("media")
          .upload(path, coverFile, { upsert: true });
        if (!uploadErr) {
          const { data } = supabase.storage.from("media").getPublicUrl(path);
          coverUrl = data.publicUrl;
        }
      }

      const { error } = await supabase.from("story_highlights").insert({
        user_id: user.id,
        title: newTitle.trim(),
        cover_url: coverUrl ?? "",
        story_ids: [],
      });

      if (error) throw error;
      toast.success("Highlight создан");
      setShowCreateSheet(false);
      setNewTitle("");
      setCoverFile(null);
      setCoverPreview(null);
      onRefresh();
    } catch (err) {
      logger.error("[StoryHighlights] Не удалось создать Highlight", { error: err });
      toast.error("Не удалось создать Highlight. Попробуйте снова.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("story_highlights")
      .delete()
      .eq("id", id)
      .eq("user_id", user?.id ?? "");
    if (error) {
      toast.error("Ошибка удаления");
      return;
    }
    toast.success("Highlight удалён");
    onRefresh();
  };

  return (
    <div className="w-full">
      {/* Горизонтальный скролл */}
      <div className="flex gap-4 overflow-x-auto px-4 py-2 scrollbar-hide">
        {/* Кнопка создания (только владелец) */}
        {isOwner && (
          <button
            onClick={() => setShowCreateSheet(true)}
            className="flex flex-col items-center gap-1 flex-shrink-0"
          >
            <div className="w-16 h-16 rounded-full border-2 border-dashed border-muted-foreground/40 flex items-center justify-center bg-muted/30">
              <Plus className="w-6 h-6 text-muted-foreground" />
            </div>
            <span className="text-xs text-muted-foreground">Новый</span>
          </button>
        )}

        {/* Список highlights */}
        {highlights.map((h) => (
          <div key={h.id} className="flex flex-col items-center gap-1 flex-shrink-0 relative">
            <button
              onClick={() => onHighlightPress(h)}
              className="w-16 h-16 rounded-full ring-2 ring-border overflow-hidden"
            >
              {h.cover_url ? (
                <img loading="lazy"
                  src={h.cover_url}
                  alt={h.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <span className="text-white text-xl font-bold">
                    {h.title.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </button>
            <span className="text-xs text-center max-w-[64px] truncate">{h.title}</span>

            {/* Кнопка удаления для владельца */}
            {isOwner && (
              <button
                onClick={() => handleDelete(h.id)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-destructive rounded-full flex items-center justify-center"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Sheet создания */}
      <Sheet open={showCreateSheet} onOpenChange={setShowCreateSheet}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Новый Highlight</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 mt-4">
            {/* Обложка */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mx-auto w-24 h-24 rounded-full border-2 border-dashed border-muted-foreground/40 overflow-hidden flex items-center justify-center bg-muted/30"
            >
              {coverPreview ? (
                <img loading="lazy" src={coverPreview} alt="cover" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <Plus className="w-6 h-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Обложка</span>
                </div>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleCoverSelect}
            />

            {/* Название */}
            <Input
              placeholder="Название highlight..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              maxLength={15}
            />
            <span className="text-xs text-muted-foreground text-right">
              {newTitle.length}/15
            </span>

            <Button
              onClick={handleCreate}
              disabled={!newTitle.trim() || isSubmitting}
              className="w-full"
            >
              {isSubmitting ? "Создание..." : "Создать"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
