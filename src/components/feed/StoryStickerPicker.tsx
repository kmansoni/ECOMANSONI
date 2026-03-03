import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Type,
  MapPin,
  AtSign,
  Hash,
  Link,
  Music,
  BarChart2,
  HelpCircle,
  CheckSquare,
  Smile,
  Clock,
  Image as ImageIcon,
  Plus,
  X,
} from "lucide-react";

export type StickerType =
  | "text"
  | "location"
  | "mention"
  | "hashtag"
  | "gif"
  | "link"
  | "music"
  | "poll"
  | "question"
  | "quiz"
  | "emoji_slider"
  | "countdown"
  | "add_yours";

interface StoryStickerPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: StickerType) => void;
}

const STICKERS: { type: StickerType; label: string; icon: React.ReactNode; color: string }[] = [
  { type: "text", label: "Текст", icon: <Type className="w-6 h-6" />, color: "bg-blue-500" },
  { type: "mention", label: "Упоминание", icon: <AtSign className="w-6 h-6" />, color: "bg-purple-500" },
  { type: "hashtag", label: "Хэштег", icon: <Hash className="w-6 h-6" />, color: "bg-indigo-500" },
  { type: "location", label: "Место", icon: <MapPin className="w-6 h-6" />, color: "bg-red-500" },
  { type: "gif", label: "GIF", icon: <ImageIcon className="w-6 h-6" />, color: "bg-green-500" },
  { type: "link", label: "Ссылка", icon: <Link className="w-6 h-6" />, color: "bg-orange-500" },
  { type: "music", label: "Музыка", icon: <Music className="w-6 h-6" />, color: "bg-pink-500" },
  { type: "poll", label: "Опрос", icon: <BarChart2 className="w-6 h-6" />, color: "bg-yellow-500" },
  { type: "question", label: "Вопрос", icon: <HelpCircle className="w-6 h-6" />, color: "bg-teal-500" },
  { type: "quiz", label: "Викторина", icon: <CheckSquare className="w-6 h-6" />, color: "bg-violet-500" },
  { type: "emoji_slider", label: "Слайдер", icon: <Smile className="w-6 h-6" />, color: "bg-amber-500" },
  { type: "countdown", label: "Таймер", icon: <Clock className="w-6 h-6" />, color: "bg-cyan-500" },
  { type: "add_yours", label: "Добавь своё", icon: <Plus className="w-6 h-6" />, color: "bg-rose-500" },
];

export function StoryStickerPicker({ isOpen, onClose, onSelect }: StoryStickerPickerProps) {
  const [search, setSearch] = useState("");

  const filtered = STICKERS.filter((s) =>
    s.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25 }}
          className="fixed inset-x-0 bottom-0 z-50 bg-zinc-900 rounded-t-3xl max-h-[70vh] overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h2 className="text-white font-semibold">Стикеры</h2>
            <button onClick={onClose} className="p-1 text-zinc-400">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="px-4 pb-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск стикеров..."
              className="w-full bg-zinc-800 text-white rounded-xl px-3 py-2 text-sm outline-none"
            />
          </div>
          <div className="grid grid-cols-4 gap-3 px-4 pb-8 overflow-y-auto max-h-[50vh]">
            {filtered.map((sticker) => (
              <button
                key={sticker.type}
                onClick={() => { onSelect(sticker.type); onClose(); }}
                className="flex flex-col items-center gap-2"
              >
                <div className={`${sticker.color} w-14 h-14 rounded-2xl flex items-center justify-center text-white`}>
                  {sticker.icon}
                </div>
                <span className="text-white text-xs text-center">{sticker.label}</span>
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
