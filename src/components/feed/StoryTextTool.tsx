import { useState, useRef } from "react";
import { AlignLeft, AlignCenter, AlignRight, X, Check } from "lucide-react";
import { motion } from "framer-motion";

export interface TextLayer {
  id: string;
  text: string;
  font: string;
  color: string;
  align: "left" | "center" | "right";
  background: boolean;
  x: number;
  y: number;
  fontSize: number;
}

interface StoryTextToolProps {
  onAdd: (layer: TextLayer) => void;
  onClose: () => void;
}

const FONTS = [
  { label: "Обычный", value: "font-sans" },
  { label: "Жирный", value: "font-bold" },
  { label: "Курсив", value: "italic font-serif" },
  { label: "Моно", value: "font-mono" },
  { label: "Декор", value: "font-serif" },
];

const COLORS = [
  "#ffffff", "#000000", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6",
  "#f59e0b", "#06b6d4",
];

export function StoryTextTool({ onAdd, onClose }: StoryTextToolProps) {
  const [text, setText] = useState("");
  const [font, setFont] = useState(FONTS[0].value);
  const [color, setColor] = useState("#ffffff");
  const [align, setAlign] = useState<"left" | "center" | "right">("center");
  const [background, setBackground] = useState(false);

  const handleAdd = () => {
    if (!text.trim()) return;
    onAdd({
      id: Date.now().toString(),
      text,
      font,
      color,
      align,
      background,
      x: 0.5,
      y: 0.5,
      fontSize: 24,
    });
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-black/80 flex flex-col"
    >
      {/* Toolbar top */}
      <div className="flex items-center justify-between p-4">
        <button onClick={onClose} className="text-white p-2">
          <X className="w-6 h-6" />
        </button>
        <div className="flex gap-4">
          {/* Align */}
          {(["left", "center", "right"] as const).map((a) => (
            <button key={a} onClick={() => setAlign(a)} className={align === a ? "text-white" : "text-zinc-500"}>
              {a === "left" ? <AlignLeft className="w-5 h-5" /> : a === "center" ? <AlignCenter className="w-5 h-5" /> : <AlignRight className="w-5 h-5" />}
            </button>
          ))}
          {/* Background toggle */}
          <button
            onClick={() => setBackground(!background)}
            className={`px-2 py-1 rounded text-xs font-medium ${background ? "bg-white text-black" : "bg-zinc-700 text-white"}`}
          >
            Фон
          </button>
        </div>
        <button onClick={handleAdd} disabled={!text.trim()} className="text-white p-2 disabled:opacity-40">
          <Check className="w-6 h-6" />
        </button>
      </div>

      {/* Fonts */}
      <div className="flex gap-2 px-4 overflow-x-auto pb-2 scrollbar-hide">
        {FONTS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFont(f.value)}
            className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${font === f.value ? "bg-white text-black" : "bg-zinc-800 text-white"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Text preview & input */}
      <div className="flex-1 flex items-center justify-center px-6">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Введите текст..."
          className={`bg-transparent text-${align} outline-none resize-none w-full max-w-xs text-2xl ${font} ${background ? "bg-black/60 rounded-lg px-3 py-2" : ""}`}
          style={{ color, textAlign: align }}
          rows={4}
        />
      </div>

      {/* Colors */}
      <div className="flex gap-2 px-4 pb-8 overflow-x-auto scrollbar-hide">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`w-8 h-8 rounded-full border-2 flex-shrink-0 ${color === c ? "border-white scale-110" : "border-transparent"}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </motion.div>
  );
}
