import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { createHighlight } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";

interface CreateHighlightSheetProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onCreated: () => void;
}

export function CreateHighlightSheet({ isOpen, onClose, userId, onCreated }: CreateHighlightSheetProps) {
  const [title, setTitle] = useState("");
  const [step, setStep] = useState<"stories" | "title">("stories");
  const [stories, setStories] = useState<any[]>([]);
  const [loadingStories, setLoadingStories] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStep("stories");
    setTitle("");
    setSelectedIds([]);
    fetchStories();
  }, [isOpen]);

  const fetchStories = async () => {
    setLoadingStories(true);
    try {
      const { data } = await (supabase as any)
        .from("stories")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      setStories(data || []);
    } catch {
      // ignore
    } finally {
      setLoadingStories(false);
    }
  };

  const toggleStory = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error("Введите название подборки");
      return;
    }
    setSaving(true);
    try {
      await createHighlight(userId, title.trim(), null, selectedIds);
      toast.success("Подборка создана");
      onCreated();
      onClose();
    } catch {
      toast.error("Не удалось создать подборку");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/60 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 bg-background rounded-t-3xl overflow-hidden"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            style={{ maxHeight: "90dvh" }}
          >
            <div className="flex items-center justify-between px-4 py-4 border-b border-border">
              <button onClick={onClose}>
                <X className="w-5 h-5" />
              </button>
              <h2 className="font-semibold text-base">
                {step === "stories" ? "Выберите Stories" : "Название подборки"}
              </h2>
              {step === "stories" ? (
                <button
                  onClick={() => setStep("title")}
                  disabled={selectedIds.length === 0}
                  className="text-primary font-semibold text-sm disabled:opacity-40"
                >
                  Далее
                </button>
              ) : (
                <button
                  onClick={handleCreate}
                  disabled={saving}
                  className="text-primary font-semibold text-sm disabled:opacity-40"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Создать"}
                </button>
              )}
            </div>

            <div className="overflow-y-auto pb-10">
              {step === "stories" ? (
                loadingStories ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : stories.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">
                    Нет доступных Stories для добавления
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1 p-2">
                    {stories.map(story => {
                      const selected = selectedIds.includes(story.id);
                      return (
                        <button
                          key={story.id}
                          onClick={() => toggleStory(story.id)}
                          className="relative aspect-[9/16] rounded-xl overflow-hidden"
                        >
                          {story.media_url && (
                            <img
                              src={story.media_url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          )}
                          {selected && (
                            <div className="absolute inset-0 bg-primary/30 flex items-center justify-center">
                              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                                <Check className="w-4 h-4 text-white" />
                              </div>
                            </div>
                          )}
                          <div className={`absolute inset-0 border-2 rounded-xl transition-colors ${selected ? "border-primary" : "border-transparent"}`} />
                        </button>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="px-4 py-6">
                  <input
                    autoFocus
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Название подборки"
                    maxLength={50}
                    className="w-full text-lg font-medium bg-transparent border-b border-border pb-2 outline-none text-foreground placeholder:text-muted-foreground"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Выбрано Stories: {selectedIds.length}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
