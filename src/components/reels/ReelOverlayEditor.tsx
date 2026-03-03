import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Type, Smile, X, Check } from "lucide-react";

interface OverlayItem {
  id: string;
  type: "text" | "sticker";
  content: string;
  x: number;
  y: number;
  fontSize?: number;
  color?: string;
}

interface ReelOverlayEditorProps {
  onSave: (items: OverlayItem[]) => void;
  onClose: () => void;
}

const EMOJI_LIST = ["😂", "❤️", "🔥", "🎉", "👏", "😍", "🥳", "💯", "✨", "🤩"];

export function ReelOverlayEditor({ onSave, onClose }: ReelOverlayEditorProps) {
  const [items, setItems] = useState<OverlayItem[]>([]);
  const [mode, setMode] = useState<"none" | "text" | "emoji">("none");
  const [textInput, setTextInput] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const addText = () => {
    if (!textInput.trim()) return;
    setItems((prev) => [
      ...prev,
      { id: Date.now().toString(), type: "text", content: textInput, x: 0.5, y: 0.5, fontSize: 24, color: "#ffffff" },
    ]);
    setTextInput("");
    setMode("none");
  };

  const addSticker = (emoji: string) => {
    setItems((prev) => [
      ...prev,
      { id: Date.now().toString(), type: "sticker", content: emoji, x: 0.3 + Math.random() * 0.4, y: 0.3 + Math.random() * 0.4 },
    ]);
    setMode("none");
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div className="absolute inset-0 z-30">
      {/* Overlay items */}
      <div ref={containerRef} className="absolute inset-0">
        {items.map((item) => (
          <motion.div
            key={item.id}
            drag
            dragConstraints={containerRef}
            style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%`, position: "absolute", transform: "translate(-50%,-50%)" }}
            className="cursor-move"
          >
            {item.type === "text" ? (
              <div className="relative group">
                <span style={{ fontSize: item.fontSize, color: item.color }} className="font-bold drop-shadow-lg select-none">
                  {item.content}
                </span>
                <button
                  onClick={() => removeItem(item.id)}
                  className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-2.5 h-2.5 text-white" />
                </button>
              </div>
            ) : (
              <div className="relative group">
                <span className="text-4xl select-none">{item.content}</span>
                <button
                  onClick={() => removeItem(item.id)}
                  className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-2.5 h-2.5 text-white" />
                </button>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Top controls */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4">
        <button onClick={onClose} className="text-white bg-black/40 rounded-full p-1.5">
          <X className="w-5 h-5" />
        </button>
        <div className="flex gap-2">
          <button onClick={() => setMode("text")} className="text-white bg-black/40 rounded-full p-1.5">
            <Type className="w-5 h-5" />
          </button>
          <button onClick={() => setMode("emoji")} className="text-white bg-black/40 rounded-full p-1.5">
            <Smile className="w-5 h-5" />
          </button>
        </div>
        <button onClick={() => onSave(items)} className="text-white bg-primary rounded-full p-1.5">
          <Check className="w-5 h-5" />
        </button>
      </div>

      {/* Text input */}
      {mode === "text" && (
        <div className="absolute bottom-20 left-0 right-0 px-4 flex gap-2">
          <input
            autoFocus
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addText()}
            placeholder="Введите текст..."
            className="flex-1 bg-black/60 text-white rounded-xl px-3 py-2 text-sm outline-none border border-white/20"
          />
          <button onClick={addText} className="bg-primary text-white rounded-xl px-3 py-2 text-sm font-medium">
            Добавить
          </button>
        </div>
      )}

      {/* Emoji picker */}
      {mode === "emoji" && (
        <div className="absolute bottom-20 left-0 right-0 px-4 flex gap-3 overflow-x-auto pb-2">
          {EMOJI_LIST.map((e) => (
            <button key={e} onClick={() => addSticker(e)} className="text-3xl flex-shrink-0">
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
