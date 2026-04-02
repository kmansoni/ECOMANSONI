/**
 * AIStickerSheet — Sheet для генерации AI-стикеров.
 *
 * Функциональность:
 * - Текстовое поле + quick suggestions
 * - Превью стикера
 * - "Сохранить в коллекцию" / "Отправить"
 * - Мои стикеры (горизонтальный скролл)
 */
import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Loader2,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAIStickers } from "@/hooks/useAIStickers";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

const QUICK_SUGGESTIONS = [
  "котик", "собачка", "сердечко", "огонь",
  "звёздочка", "радуга", "единорог", "пицца",
  "ракета", "корона", "цветок", "смайлик",
] as const;

interface AIStickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSendSticker?: (url: string) => void;
}

export function AIStickerSheet({ open, onOpenChange, onSendSticker }: AIStickerSheetProps) {
  const { generateSticker, myStickers, saveSticker, deleteSticker, isGenerating, loading } = useAIStickers();
  const [prompt, setPrompt] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPrompt, setPreviewPrompt] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleGenerate = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setPreviewUrl(null);
      setPreviewPrompt(trimmed);

      const result = await generateSticker(trimmed);
      if (result) {
        setPreviewUrl(result.url);
      }
    },
    [generateSticker],
  );

  const handleSave = useCallback(async () => {
    if (!previewUrl || !previewPrompt) return;
    await saveSticker(previewUrl, previewPrompt);
  }, [previewUrl, previewPrompt, saveSticker]);

  const handleSend = useCallback(() => {
    if (!previewUrl || !onSendSticker) return;
    onSendSticker(previewUrl);
    onOpenChange(false);
  }, [previewUrl, onSendSticker, onOpenChange]);

  const handleSendExisting = useCallback(
    (url: string) => {
      if (!onSendSticker) return;
      onSendSticker(url);
      onOpenChange(false);
    },
    [onSendSticker, onOpenChange],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            AI Стикеры
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 mt-4 overflow-y-auto max-h-[calc(80vh-100px)]">
          {/* Поле ввода */}
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              placeholder="Опишите стикер..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleGenerate(prompt);
                }
              }}
              maxLength={300}
              className="flex-1"
              aria-label="Описание стикера"
            />
            <Button
              onClick={() => handleGenerate(prompt)}
              disabled={isGenerating || !prompt.trim()}
              size="icon"
              className="min-h-[44px] min-w-[44px]"
              aria-label="Сгенерировать стикер"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* Quick suggestions */}
          <div className="flex flex-wrap gap-1.5">
            {QUICK_SUGGESTIONS.map((s) => (
              <Button
                key={s}
                variant="outline"
                size="sm"
                onClick={() => {
                  setPrompt(s);
                  handleGenerate(s);
                }}
                disabled={isGenerating}
                className="text-xs min-h-[36px]"
              >
                {s}
              </Button>
            ))}
          </div>

          {/* Превью */}
          <AnimatePresence mode="wait">
            {isGenerating && (
              <motion.div
                key="generating"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-2 py-4"
              >
                <Skeleton className="w-32 h-32 rounded-2xl" />
                <p className="text-sm text-muted-foreground">Генерация «{previewPrompt}»...</p>
              </motion.div>
            )}

            {previewUrl && !isGenerating && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-3"
              >
                <div className="w-40 h-40 rounded-2xl overflow-hidden border dark:border-gray-700 bg-white">
                  <img
                    src={previewUrl}
                    alt={previewPrompt}
                    className="w-full h-full object-contain"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSave}
                    className="min-h-[44px]"
                    aria-label="Сохранить в коллекцию"
                  >
                    <Save className="w-4 h-4" />
                    Сохранить
                  </Button>
                  {onSendSticker && (
                    <Button
                      size="sm"
                      onClick={handleSend}
                      className="min-h-[44px]"
                      aria-label="Отправить стикер"
                    >
                      <Send className="w-4 h-4" />
                      Отправить
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setPreviewUrl(null); setPreviewPrompt(""); }}
                    className="min-h-[44px]"
                    aria-label="Очистить"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Мои стикеры */}
          <div>
            <p className="text-sm font-medium mb-2">Мои стикеры</p>
            {loading ? (
              <div className="flex gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="w-20 h-20 rounded-xl flex-shrink-0" />
                ))}
              </div>
            ) : myStickers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Пока нет сохранённых стикеров
              </p>
            ) : (
              <ScrollArea className="w-full whitespace-nowrap">
                <div className="flex gap-2 pb-2">
                  {myStickers.map((sticker) => (
                    <div key={sticker.id} className="relative group flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSendExisting(sticker.image_url)}
                        className="w-20 h-20 rounded-xl overflow-hidden border dark:border-gray-700 bg-white hover:ring-2 hover:ring-primary transition-all min-h-[44px] min-w-[44px]"
                        aria-label={`Стикер: ${sticker.prompt}`}
                      >
                        <img
                          src={sticker.image_url}
                          alt={sticker.prompt}
                          className="w-full h-full object-contain"
                          loading="lazy"
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSticker(sticker.id)}
                        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Удалить стикер"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
