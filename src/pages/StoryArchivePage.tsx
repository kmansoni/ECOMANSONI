/**
 * @file src/pages/StoryArchivePage.tsx
 * @description Архив Stories — все истории пользователя за всё время.
 * Instagram Archive стиль: сетка по датам, возможность добавить в Highlight.
 *
 * Архитектура:
 * - Загрузка всех историй пользователя (включая истёкшие)
 * - Группировка по месяцам
 * - Просмотр архивной истории
 * - Добавление в Highlight прямо из архива
 * - Настройка: включить/выключить архивирование
 */

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Archive, Plus, Eye, Clock, Loader2, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { dbLoose } from "@/lib/supabase";

interface ArchivedStory {
  id: string;
  user_id: string;
  media_url: string;
  media_type: "image" | "video";
  thumbnail_url: string | null;
  created_at: string;
  expires_at: string;
  view_count: number;
}

interface MonthGroup {
  label: string;
  stories: ArchivedStory[];
}

function groupByMonth(stories: ArchivedStory[]): MonthGroup[] {
  const map = new Map<string, ArchivedStory[]>();
  for (const story of stories) {
    const date = new Date(story.created_at);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const label = date.toLocaleDateString("ru", { month: "long", year: "numeric" });
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(story);
  }
  return Array.from(map.entries()).map(([, stories]) => ({
    label: new Date(stories[0].created_at).toLocaleDateString("ru", { month: "long", year: "numeric" }),
    stories,
  }));
}

export default function StoryArchivePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stories, setStories] = useState<ArchivedStory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStory, setSelectedStory] = useState<ArchivedStory | null>(null);
  const [archiveEnabled, setArchiveEnabled] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerStory, setPickerStory] = useState<ArchivedStory | null>(null);
  const [highlights, setHighlights] = useState<{ id: string; title: string; cover_url: string }[]>([]);
  const [hlLoading, setHlLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  const loadArchive = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);

    const { data, error } = await dbLoose
      .from("stories")
      .select("id, user_id, media_url, media_type, thumbnail_url, created_at, expires_at, view_count")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setStories(data as unknown as ArchivedStory[]);
    }
    setIsLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void loadArchive();
  }, [loadArchive]);

  const handleAddToHighlight = async (story: ArchivedStory) => {
    setPickerStory(story);
    setPickerOpen(true);
    setHlLoading(true);
    const { data } = await dbLoose
      .from("story_highlights")
      .select("id, title, cover_url")
      .eq("user_id", user!.id)
      .order("position");
    setHighlights((data as any[]) ?? []);
    setHlLoading(false);
  };

  const handlePickHighlight = async (highlightId: string) => {
    if (!pickerStory) return;
    setAdding(highlightId);
    const { error } = await dbLoose
      .from("highlight_stories")
      .upsert({ highlight_id: highlightId, story_id: pickerStory.id }, { onConflict: "highlight_id,story_id" });
    setAdding(null);
    if (error) {
      toast.error("Не удалось добавить");
    } else {
      toast.success("Добавлено в Highlight");
      setPickerOpen(false);
      setPickerStory(null);
    }
  };

  const monthGroups = groupByMonth(stories);

  return (
    <div className="min-h-screen bg-background">
      {/* Шапка */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)}>
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="flex-1">
          <h1 className="font-semibold">Архив историй</h1>
          <p className="text-xs text-muted-foreground">{stories.length} историй</p>
        </div>
        {/* Настройка архива */}
        <button
          onClick={() => setArchiveEnabled(!archiveEnabled)}
          className={cn(
            "relative w-10 h-5 rounded-full transition-colors",
            archiveEnabled ? "bg-primary" : "bg-muted"
          )}
        >
          <div className={cn(
            "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
            archiveEnabled ? "translate-x-5" : "translate-x-0.5"
          )} />
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-0.5 p-0.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[9/16] bg-muted animate-pulse" />
          ))}
        </div>
      ) : stories.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 px-8">
          <Archive className="w-16 h-16 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Архив пуст</h2>
          <p className="text-sm text-muted-foreground text-center">
            Ваши истории будут автоматически сохраняться здесь после истечения срока.
          </p>
        </div>
      ) : (
        <div className="pb-8">
          {monthGroups.map((group) => (
            <div key={group.label}>
              {/* Заголовок месяца */}
              <div className="px-4 py-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold capitalize">{group.label}</span>
                <span className="text-xs text-muted-foreground">({group.stories.length})</span>
              </div>

              {/* Сетка историй */}
              <div className="grid grid-cols-3 gap-0.5">
                {group.stories.map((story, i) => (
                  <motion.button
                    key={story.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    onClick={() => setSelectedStory(story)}
                    className="relative aspect-[9/16] overflow-hidden bg-muted"
                  >
                    {story.thumbnail_url || story.media_type === "image" ? (
                      <img
                        src={story.thumbnail_url ?? story.media_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500" />
                    )}

                    {/* Дата */}
                    <div className="absolute bottom-1 left-1 bg-black/60 rounded px-1 py-0.5">
                      <span className="text-white text-xs">
                        {new Date(story.created_at).toLocaleDateString("ru", { day: "numeric", month: "short" })}
                      </span>
                    </div>

                    {/* Просмотры */}
                    {story.view_count > 0 && (
                      <div className="absolute top-1 right-1 flex items-center gap-0.5 bg-black/60 rounded px-1 py-0.5">
                        <Eye className="w-2.5 h-2.5 text-white" />
                        <span className="text-white text-xs">{story.view_count}</span>
                      </div>
                    )}

                    {/* Видео индикатор */}
                    {story.media_type === "video" && (
                      <div className="absolute top-1 left-1 bg-black/60 rounded px-1 py-0.5">
                        <span className="text-white text-xs">▶</span>
                      </div>
                    )}
                  </motion.button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Просмотр выбранной истории */}
      {selectedStory && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          {/* Медиа */}
          <div className="flex-1 relative">
            {selectedStory.media_type === "video" ? (
              <video
                src={selectedStory.media_url}
                autoPlay
                playsInline
                loop
                className="w-full h-full object-cover"
              />
            ) : (
              <img
                src={selectedStory.media_url}
                alt=""
                className="w-full h-full object-cover"
              />
            )}

            {/* Шапка */}
            <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between">
              <button onClick={() => setSelectedStory(null)} className="text-white">
                <ArrowLeft className="w-6 h-6" />
              </button>
              <div className="text-center">
                <p className="text-white text-sm font-semibold">
                  {new Date(selectedStory.created_at).toLocaleDateString("ru", {
                    day: "numeric", month: "long", year: "numeric"
                  })}
                </p>
                <div className="flex items-center gap-1 justify-center">
                  <Eye className="w-3 h-3 text-white/70" />
                  <span className="text-white/70 text-xs">{selectedStory.view_count} просмотров</span>
                </div>
              </div>
              <div className="w-6" />
            </div>

            {/* Кнопка добавить в Highlight */}
            <div className="absolute bottom-8 left-0 right-0 flex justify-center">
              <button
                onClick={() => handleAddToHighlight(selectedStory)}
                className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-5 py-3"
              >
                <Plus className="w-5 h-5 text-white" />
                <span className="text-white font-semibold">Добавить в Highlight</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Highlight picker sheet */}
      <AnimatePresence>
        {pickerOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/60 z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPickerOpen(false)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 rounded-t-3xl p-5 pb-10 max-h-[60vh] overflow-y-auto"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
            >
              <div className="w-10 h-1 bg-zinc-600 rounded-full mx-auto mb-4" />
              <h3 className="text-white font-bold text-lg mb-4">Добавить в Highlight</h3>
              {hlLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                </div>
              ) : highlights.length === 0 ? (
                <p className="text-zinc-400 text-center py-8 text-sm">
                  У вас нет подборок. Создайте первую на странице профиля.
                </p>
              ) : (
                <div className="space-y-2">
                  {highlights.map(hl => (
                    <button
                      key={hl.id}
                      onClick={() => handlePickHighlight(hl.id)}
                      disabled={adding === hl.id}
                      className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-zinc-800 transition-colors"
                    >
                      <img src={hl.cover_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                      <span className="text-white flex-1 text-left">{hl.title}</span>
                      {adding === hl.id ? (
                        <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
                      ) : (
                        <Check className="w-5 h-5 text-zinc-500" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
