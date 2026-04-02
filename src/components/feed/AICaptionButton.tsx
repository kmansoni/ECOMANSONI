/**
 * AICaptionButton — кнопка генерации AI-подписи для публикации / рила.
 * Sparkles icon, выпадающий селектор стиля, вставка в текстовое поле.
 */

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Loader2, Check } from "lucide-react";
import { useAICaption, type CaptionStyle } from "@/hooks/useAICaption";
import { logger } from "@/lib/logger";

interface AICaptionButtonProps {
  imageUrl?: string;
  context?: string;
  onCaption: (text: string) => void;
}

interface StyleOption {
  value: CaptionStyle;
  label: string;
  emoji: string;
}

const STYLES: StyleOption[] = [
  { value: "casual", label: "Casual", emoji: "😊" },
  { value: "professional", label: "Деловой", emoji: "💼" },
  { value: "funny", label: "Смешной", emoji: "😂" },
  { value: "inspirational", label: "Мотивация", emoji: "🔥" },
];

export function AICaptionButton({ imageUrl, context, onCaption }: AICaptionButtonProps) {
  const { generateCaption, isGenerating: loading } = useAICaption();
  const [showStyles, setShowStyles] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<CaptionStyle>("casual");
  const containerRef = useRef<HTMLDivElement>(null);

  const handleGenerate = useCallback(
    async (style: CaptionStyle) => {
      setSelectedStyle(style);
      setShowStyles(false);

      const result = await generateCaption(imageUrl, context, style);
      if (result) {
        onCaption(result);
      }
    },
    [generateCaption, imageUrl, context, onCaption]
  );

  const handleMainClick = useCallback(() => {
    if (loading) return;
    setShowStyles((v) => !v);
  }, [loading]);

  return (
    <div ref={containerRef} className="relative inline-flex">
      {/* Main button */}
      <button
        onClick={handleMainClick}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-gradient-to-r from-violet-500/20 to-pink-500/20 hover:from-violet-500/30 hover:to-pink-500/30 border border-violet-500/30 transition-all min-h-[44px] disabled:opacity-50"
        aria-label="Сгенерировать подпись с помощью AI"
        aria-expanded={showStyles}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
        ) : (
          <Sparkles className="w-4 h-4 text-violet-400" />
        )}
        <span className="text-xs font-medium text-violet-300">
          {loading ? "Генерация..." : "AI подпись"}
        </span>
      </button>

      {/* Style dropdown */}
      <AnimatePresence>
        {showStyles && (
          <>
            <motion.div
              key="caption-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-30"
              onClick={() => setShowStyles(false)}
            />

            <motion.div
              key="caption-styles"
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="absolute bottom-full left-0 mb-2 z-40 bg-background border border-white/10 rounded-xl shadow-2xl p-1 min-w-[160px]"
              role="listbox"
              aria-label="Стиль подписи"
            >
              {STYLES.map((s) => (
                <button
                  key={s.value}
                  role="option"
                  aria-selected={selectedStyle === s.value}
                  onClick={() => handleGenerate(s.value)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left min-h-[44px]"
                >
                  <span className="text-lg">{s.emoji}</span>
                  <span className="text-sm flex-1">{s.label}</span>
                  {selectedStyle === s.value && (
                    <Check className="w-3.5 h-3.5 text-violet-400" />
                  )}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
