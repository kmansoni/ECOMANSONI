import { motion, AnimatePresence } from "framer-motion";
import { X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const CHAT_THEMES = [
  { id: "default", label: "По умолчанию", gradient: "from-zinc-900 to-zinc-950", preview: "#18181b" },
  { id: "midnight", label: "Полночь", gradient: "from-indigo-950 to-black", preview: "#1e1b4b" },
  { id: "rose", label: "Роза", gradient: "from-rose-950 to-zinc-950", preview: "#4c0519" },
  { id: "ocean", label: "Океан", gradient: "from-cyan-950 to-zinc-950", preview: "#083344" },
  { id: "forest", label: "Лес", gradient: "from-green-950 to-zinc-950", preview: "#052e16" },
  { id: "sunset", label: "Закат", gradient: "from-orange-950 to-zinc-950", preview: "#431407" },
  { id: "purple", label: "Фиолетовый", gradient: "from-purple-950 to-zinc-950", preview: "#3b0764" },
  { id: "gold", label: "Золото", gradient: "from-yellow-950 to-zinc-950", preview: "#422006" },
  { id: "pink", label: "Розовый", gradient: "from-pink-950 to-zinc-950", preview: "#500724" },
  { id: "teal", label: "Бирюза", gradient: "from-teal-950 to-zinc-950", preview: "#042f2e" },
  { id: "red", label: "Красный", gradient: "from-red-950 to-zinc-950", preview: "#450a0a" },
  { id: "blue", label: "Синий", gradient: "from-blue-950 to-zinc-950", preview: "#172554" },
] as const;

export type ThemeId = (typeof CHAT_THEMES)[number]["id"];

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
  const handleSelect = async (themeId: ThemeId) => {
    try {
      await (supabase as any)
        .from("conversations")
        .update({ theme: themeId })
        .eq("id", conversationId);
      onThemeChange(themeId, currentEmoji);
    } catch {
      toast.error("Не удалось сменить тему");
    }
  };

  const handleEmojiSelect = async (emoji: string) => {
    try {
      await (supabase as any)
        .from("conversations")
        .update({ emoji })
        .eq("id", conversationId);
      onThemeChange(currentTheme, emoji);
    } catch {
      toast.error("Не удалось изменить эмодзи");
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
                      onClick={() => handleSelect(theme.id)}
                      className="flex flex-col items-center gap-1.5"
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
                      onClick={() => handleEmojiSelect(emoji)}
                      className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all ${
                        currentEmoji === emoji ? "bg-white/20 ring-2 ring-white" : "bg-zinc-800"
                      }`}
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
