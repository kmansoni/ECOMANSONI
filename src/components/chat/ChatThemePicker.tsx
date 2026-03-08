import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CHAT_THEMES, type ThemeId } from "./chatThemes";

const EMOJIS = ["❤️", "🔥", "⭐", "🌙", "🌈", "💫", "🎵", "🌸", "🦋", "🎉", "🍀", "🐾"];

interface ChatThemePickerProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  currentTheme: ThemeId;
  currentEmoji: string;
  onThemeChange: (theme: ThemeId, emoji: string) => void;
}

export function ChatThemePicker({
  isOpen, onClose, conversationId, currentTheme, currentEmoji, onThemeChange
}: ChatThemePickerProps) {
  const [savingField, setSavingField] = useState<"theme" | "emoji" | null>(null);
  const requestSeqRef = useRef(0);

  const handleSelect = async (themeId: ThemeId) => {
    if (savingField) return;
    const requestSeq = ++requestSeqRef.current;
    setSavingField("theme");

    try {
      const { data, error } = await supabase
        .from("conversations")
        .update({ theme: themeId })
        .eq("id", conversationId)
        .select("id")
        .maybeSingle();

      if (requestSeq !== requestSeqRef.current) {
        return;
      }

      if (error) {
        throw error;
      }

      if (!data?.id) {
        toast.error("Не удалось сменить тему", {
          description: "Нет доступа к чату или запись не найдена",
        });
        return;
      }

      onThemeChange(themeId, currentEmoji);
    } catch (err: unknown) {
      toast.error("Не удалось сменить тему", {
        description: err instanceof Error ? err.message : "Ошибка сохранения",
      });
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setSavingField(null);
      }
    }
  };

  const handleEmojiSelect = async (emoji: string) => {
    if (savingField) return;
    const requestSeq = ++requestSeqRef.current;
    setSavingField("emoji");

    try {
      const { data, error } = await supabase
        .from("conversations")
        .update({ emoji })
        .eq("id", conversationId)
        .select("id")
        .maybeSingle();

      if (requestSeq !== requestSeqRef.current) {
        return;
      }

      if (error) {
        throw error;
      }

      if (!data?.id) {
        toast.error("Не удалось изменить эмодзи", {
          description: "Нет доступа к чату или запись не найдена",
        });
        return;
      }

      onThemeChange(currentTheme, emoji);
    } catch (err: unknown) {
      toast.error("Не удалось изменить эмодзи", {
        description: err instanceof Error ? err.message : "Ошибка сохранения",
      });
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setSavingField(null);
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-50"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25 }}
            className="fixed inset-x-0 bottom-0 z-50 bg-zinc-900 rounded-t-3xl pb-safe"
          >
            <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800">
              <h2 className="text-white font-semibold">Тема чата</h2>
              <button onClick={onClose} className="text-zinc-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* Themes */}
              <div>
                <p className="text-zinc-400 text-xs mb-3">Цветовая тема</p>
                <div className="grid grid-cols-4 gap-3">
                  {CHAT_THEMES.map(theme => (
                    <button
                      key={theme.id}
                      type="button"
                      disabled={Boolean(savingField)}
                      onClick={() => handleSelect(theme.id)}
                      className="flex flex-col items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <div
                        className="w-14 h-14 rounded-2xl relative border-2 transition-all"
                        style={{
                          background: `linear-gradient(135deg, ${theme.preview}, #09090b)`,
                          borderColor: currentTheme === theme.id ? "#fff" : "transparent",
                        }}
                      >
                        {currentTheme === theme.id && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Check className="w-5 h-5 text-white" />
                          </div>
                        )}
                      </div>
                      <span className="text-zinc-400 text-[10px] text-center leading-tight">{theme.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Emoji */}
              <div>
                <p className="text-zinc-400 text-xs mb-3">Эмодзи чата</p>
                <div className="flex gap-2 flex-wrap">
                  {EMOJIS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      disabled={Boolean(savingField)}
                      onClick={() => handleEmojiSelect(emoji)}
                      className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all ${
                        currentEmoji === emoji ? "bg-white/20 ring-2 ring-white" : "bg-zinc-800"
                      } disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
