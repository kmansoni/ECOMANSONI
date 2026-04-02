/**
 * AIImageGenerator — UI для AI-генерации изображений через DALL-E 3.
 *
 * Функциональность:
 * - Текстовое поле для промпта
 * - Выбор стиля: Реалистичный, Аниме, Арт, 3D
 * - Выбор размера: 256, 512, 1024
 * - Генерация + предпросмотр
 * - Кнопки: "Использовать как аватар", "Сохранить", "Поделиться"
 * - История генераций
 */
import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Download,
  Share2,
  UserCircle,
  ImageIcon,
  Loader2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useAIImageGen } from "@/hooks/useAIImageGen";
import type { GeneratedImage } from "@/hooks/useAIImageGen";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

const STYLES = ["Реалистичный", "Аниме", "Арт", "3D"] as const;
const SIZES = [
  { value: "256" as const, label: "256×256" },
  { value: "512" as const, label: "512×512" },
  { value: "1024" as const, label: "1024×1024" },
];

export function AIImageGenerator() {
  const { generate, recentGenerations, isGenerating, remainingQuota } = useAIImageGen();
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<(typeof STYLES)[number]>("Реалистичный");
  const [size, setSize] = useState<"256" | "512" | "1024">("1024");
  const [result, setResult] = useState<GeneratedImage | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      toast.error("Введите описание изображения");
      return;
    }
    const image = await generate(prompt.trim(), style, size);
    if (image) setResult(image);
  }, [prompt, style, size, generate]);

  const handleDownload = useCallback(async () => {
    if (!result?.url) return;
    try {
      const res = await fetch(result.url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ai-image-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Изображение сохранено");
    } catch (e) {
      logger.error("[AIImageGenerator] Ошибка скачивания", { error: e });
      toast.error("Не удалось сохранить изображение");
    }
  }, [result]);

  const handleShare = useCallback(async () => {
    if (!result?.url) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "AI Изображение", url: result.url });
      } catch {
        // Пользователь отменил
      }
    } else {
      await navigator.clipboard.writeText(result.url);
      toast.success("Ссылка скопирована");
    }
  }, [result]);

  const handleSetAvatar = useCallback(() => {
    if (!result?.url) return;
    toast.info("Функция установки аватара будет доступна после загрузки в профиль");
  }, [result]);

  return (
    <div className="flex flex-col gap-4 p-4 max-w-lg mx-auto">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          AI Генерация
        </h2>
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {remainingQuota}/5 в час
        </span>
      </div>

      {/* Промпт */}
      <Textarea
        placeholder="Опишите изображение... например: 'Закат над горами в стиле импрессионизма'"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        maxLength={1000}
        rows={3}
        className="resize-none"
        aria-label="Описание изображения"
      />

      {/* Стиль */}
      <div>
        <p className="text-sm text-muted-foreground mb-2">Стиль</p>
        <div className="flex flex-wrap gap-2">
          {STYLES.map((s) => (
            <Button
              key={s}
              variant={style === s ? "default" : "outline"}
              size="sm"
              onClick={() => setStyle(s)}
              className="min-h-[44px]"
              aria-pressed={style === s}
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      {/* Размер */}
      <div>
        <p className="text-sm text-muted-foreground mb-2">Размер</p>
        <div className="flex gap-2">
          {SIZES.map((s) => (
            <Button
              key={s.value}
              variant={size === s.value ? "default" : "outline"}
              size="sm"
              onClick={() => setSize(s.value)}
              className="min-h-[44px]"
              aria-pressed={size === s.value}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Кнопка генерации */}
      <Button
        onClick={handleGenerate}
        disabled={isGenerating || !prompt.trim() || remainingQuota <= 0}
        className="min-h-[44px]"
        aria-label="Сгенерировать изображение"
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Генерация...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            Сгенерировать
          </>
        )}
      </Button>

      {/* Результат */}
      <AnimatePresence mode="wait">
        {isGenerating && !result && (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Skeleton className="w-full aspect-square rounded-xl" />
          </motion.div>
        )}

        {result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-3"
          >
            <div className="relative rounded-xl overflow-hidden border dark:border-gray-700">
              <img
                src={result.url}
                alt={result.revisedPrompt}
                className="w-full aspect-square object-cover"
                loading="lazy"
              />
            </div>

            {result.revisedPrompt !== result.prompt && (
              <p className="text-xs text-muted-foreground italic">
                Уточнённый промпт: {result.revisedPrompt}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSetAvatar}
                className="flex-1 min-h-[44px]"
                aria-label="Использовать как аватар"
              >
                <UserCircle className="w-4 h-4" />
                Аватар
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                className="flex-1 min-h-[44px]"
                aria-label="Сохранить изображение"
              >
                <Download className="w-4 h-4" />
                Сохранить
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleShare}
                className="flex-1 min-h-[44px]"
                aria-label="Поделиться"
              >
                <Share2 className="w-4 h-4" />
                Поделиться
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* История */}
      {recentGenerations.length > 0 && (
        <div>
          <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
            <ImageIcon className="w-4 h-4" />
            История генераций
          </p>
          <div className="grid grid-cols-4 gap-2">
            {recentGenerations.map((img, i) => (
              <button
                key={`${img.createdAt}-${i}`}
                type="button"
                onClick={() => setResult(img)}
                className="rounded-lg overflow-hidden border dark:border-gray-700 hover:ring-2 hover:ring-primary transition-all min-h-[44px] min-w-[44px]"
                aria-label={`Генерация: ${img.prompt}`}
              >
                <img
                  src={img.url}
                  alt={img.prompt}
                  className="w-full aspect-square object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Пустое состояние */}
      {!result && !isGenerating && recentGenerations.length === 0 && (
        <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
          <Sparkles className="w-12 h-12 opacity-50" />
          <p>Введите описание и нажмите «Сгенерировать»</p>
        </div>
      )}
    </div>
  );
}
