/**
 * @file src/components/reels/ReelTemplates.tsx
 * @description Шаблоны Reels — Instagram-стиль.
 * Пользователь выбирает шаблон с заданным ритмом/аудио,
 * заполняет клипы своими видео, получает готовый Reel.
 *
 * Архитектура:
 * - Список шаблонов из БД (reel_templates)
 * - Каждый шаблон: N слотов для клипов, аудио, длительность
 * - Превью: автовоспроизведение при hover/tap
 * - Использование шаблона: открывает единый create-flow с предзаполненными параметрами
 * - use_count инкрементируется при использовании
 */

import { useState, useRef, useEffect } from "react";
import { Play, Pause, Zap, Music, Clock, Users } from "lucide-react";
import { motion } from "framer-motion";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { dbLoose } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface ReelTemplate {
  id: string;
  creator_id: string;
  title: string;
  preview_url: string | null;
  audio_url: string | null;
  audio_title: string | null;
  duration_ms: number;
  clip_count: number;
  use_count: number;
  is_public: boolean;
}

interface ReelTemplatesProps {
  onSelectTemplate: (template: ReelTemplate) => void;
  onClose: () => void;
}

function TemplateCard({
  template,
  onSelect,
}: {
  template: ReelTemplate;
  onSelect: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handleHover = (playing: boolean) => {
    if (!videoRef.current || !template.preview_url) return;
    if (playing) {
      videoRef.current.play().catch(() => { /* autoplay blocked */ });
    } else {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    setIsPlaying(playing);
  };

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className="relative rounded-xl overflow-hidden bg-muted cursor-pointer"
      style={{ aspectRatio: "9/16" }}
      onMouseEnter={() => handleHover(true)}
      onMouseLeave={() => handleHover(false)}
      onTouchStart={() => handleHover(true)}
      onTouchEnd={() => handleHover(false)}
      onClick={onSelect}
    >
      {/* Превью видео */}
      {template.preview_url ? (
        <video
          ref={videoRef}
          src={template.preview_url}
          playsInline
          muted
          loop
          preload="metadata"
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600 to-pink-600" />
      )}

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

      {/* Слоты клипов */}
      <div className="absolute top-2 left-2 flex gap-1">
        {Array.from({ length: template.clip_count }).map((_, i) => (
          <div
            key={i}
            className="w-5 h-1.5 rounded-full bg-white/60"
          />
        ))}
      </div>

      {/* Play overlay */}
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <Play className="w-5 h-5 text-white fill-white" />
          </div>
        </div>
      )}

      {/* Метаданные */}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <p className="text-white text-sm font-semibold truncate">{template.title}</p>
        <div className="flex items-center gap-2 mt-1">
          {template.audio_title && (
            <div className="flex items-center gap-1">
              <Music className="w-3 h-3 text-white/70" />
              <span className="text-white/70 text-xs truncate max-w-[80px]">
                {template.audio_title}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-white/70" />
            <span className="text-white/70 text-xs">
              {Math.round(template.duration_ms / 1000)}с
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 mt-1">
          <Users className="w-3 h-3 text-white/50" />
          <span className="text-white/50 text-xs">
            {template.use_count.toLocaleString()} использований
          </span>
        </div>
      </div>

      {/* Кнопка использовать */}
      <div className="absolute top-2 right-2">
        <div className="bg-white rounded-full px-2 py-0.5">
          <span className="text-black text-xs font-semibold">Использовать</span>
        </div>
      </div>
    </motion.div>
  );
}

export function ReelTemplates({ onSelectTemplate, onClose }: ReelTemplatesProps) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<ReelTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<"trending" | "new" | "short" | "long">("trending");

  useEffect(() => {
    loadTemplates();
  }, [activeCategory]);

  const loadTemplates = async () => {
    setIsLoading(true);
    let query = dbLoose
      .from("reel_templates")
      .select("*")
      .eq("is_public", true);

    switch (activeCategory) {
      case "trending":
        query = query.order("use_count", { ascending: false });
        break;
      case "new":
        query = query.order("created_at", { ascending: false });
        break;
      case "short":
        query = query.lte("duration_ms", 15000).order("use_count", { ascending: false });
        break;
      case "long":
        query = query.gte("duration_ms", 30000).order("use_count", { ascending: false });
        break;
    }

    const { data, error } = await query.limit(20);
    if (!error && data) setTemplates(data as ReelTemplate[]);
    setIsLoading(false);
  };

  const handleSelect = async (template: ReelTemplate) => {
    // Инкрементируем use_count
    await dbLoose
      .from("reel_templates")
      .update({ use_count: template.use_count + 1 })
      .eq("id", template.id);

    onSelectTemplate(template);
  };

  const categories = [
    { id: "trending" as const, label: "Популярные" },
    { id: "new" as const, label: "Новые" },
    { id: "short" as const, label: "До 15с" },
    { id: "long" as const, label: "30с+" },
  ];

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            Шаблоны Reels
          </SheetTitle>
        </SheetHeader>

        {/* Категории */}
        <div className="flex gap-2 overflow-x-auto py-2 scrollbar-hide">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors",
                activeCategory === cat.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Сетка шаблонов */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-2 p-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl bg-muted animate-pulse"
                  style={{ aspectRatio: "9/16" }}
                />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <Zap className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Шаблоны не найдены</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 p-2">
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onSelect={() => handleSelect(template)}
                />
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
