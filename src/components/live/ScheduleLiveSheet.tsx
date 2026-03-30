/**
 * ScheduleLiveSheet — планирование прямого эфира
 */
import React, { useState } from "react";
import { X, Radio, Calendar, Clock, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { uploadMedia } from "@/lib/mediaUpload";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { addMinutes, isBefore } from "date-fns";

interface Props {
  onClose: () => void;
  onScheduled?: (sessionId: string) => void;
}

export function ScheduleLiveSheet({ onClose, onScheduled }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dateTime, setDateTime] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const minDate = addMinutes(new Date(), 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  const minDateStr = `${minDate.getFullYear()}-${pad(minDate.getMonth() + 1)}-${pad(minDate.getDate())}T${pad(minDate.getHours())}:${pad(minDate.getMinutes())}`;

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const handleSchedule = async () => {
    if (!title.trim()) { toast.error("Введите название эфира"); return; }
    if (!dateTime) { toast.error("Выберите дату и время"); return; }
    const selectedDate = new Date(dateTime);
    if (isBefore(selectedDate, minDate)) { toast.error("Минимум через 10 минут от сейчас"); return; }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Не авторизован"); return; }

      let coverUrl: string | null = null;
      if (coverFile) {
        try {
          const uploadResult = await uploadMedia(coverFile, { bucket: 'media' });
          coverUrl = uploadResult.url;
        } catch { /* cover upload is non-critical */ }
      }

      const { data, error } = await supabase
        .from("live_sessions")
        .insert({
          creator_id: user.id,
          title: title.trim(),
          description: description.trim() || null,
          scheduled_at: selectedDate.toISOString(),
          status: "scheduled",
          cover_url: coverUrl,
          category: "general",
        })
        .select()
        .single();

      if (error) throw error;
      toast.success("Эфир запланирован! Подписчики получат уведомление.");
      onScheduled?.(String(data.id));
      onClose();
    } catch (err) {
      logger.error("[ScheduleLiveSheet] schedule failed", { error: err });
      toast.error("Не удалось запланировать эфир. Попробуйте снова.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md bg-zinc-900 rounded-t-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold text-lg flex items-center gap-2">
            <Radio className="w-5 h-5 text-red-500" />
            Запланировать эфир
          </h3>
          <button onClick={onClose}><X className="w-5 h-5 text-white/60" /></button>
        </div>

        {/* Обложка */}
        <div>
          <label className="text-sm text-white/60 mb-1 block">Обложка (необязательно)</label>
          <label className="cursor-pointer">
            {coverPreview ? (
              <img src={coverPreview} alt="cover" className="w-full h-32 object-cover rounded-xl" />
            ) : (
              <div className="w-full h-32 bg-zinc-800 rounded-xl flex flex-col items-center justify-center gap-2 border border-dashed border-white/20">
                <ImageIcon className="w-8 h-8 text-white/30" />
                <span className="text-xs text-white/40">Выбрать обложку</span>
              </div>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
          </label>
        </div>

        <div className="space-y-3">
          <Input
            placeholder="Название эфира"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-zinc-800 border-white/10 text-white"
            maxLength={100}
          />
          <Textarea
            placeholder="Описание (необязательно)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="bg-zinc-800 border-white/10 text-white resize-none"
            rows={2}
            maxLength={500}
          />
          <div>
            <label className="flex items-center gap-2 text-sm text-white/60 mb-1">
              <Calendar className="w-4 h-4" />
              Дата и время начала
            </label>
            <input
              type="datetime-local"
              value={dateTime}
              min={minDateStr}
              onChange={(e) => setDateTime(e.target.value)}
              className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm border border-white/10 focus:border-red-500 outline-none"
            />
          </div>
        </div>

        <Button
          onClick={handleSchedule}
          disabled={loading}
          className="w-full bg-red-600 hover:bg-red-700 text-white"
        >
          {loading ? "Сохранение..." : "Запланировать эфир"}
        </Button>
      </div>
    </div>
  );
}
