/**
 * src/components/feed/AltTextEditor.tsx
 *
 * Компонент для редактирования alt text изображения.
 * Ручной ввод + AI-генерация описания для screen reader.
 */
import { useState, useCallback } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAIAltText } from "@/hooks/useAIAltText";

// ── Props ────────────────────────────────────────────────────────────

interface AltTextEditorProps {
  imageUrl: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const MAX_LENGTH = 1000;

// ── Компонент ────────────────────────────────────────────────────────

export function AltTextEditor({ imageUrl, value, onChange, className }: AltTextEditorProps) {
  const { generate, loading } = useAIAltText();

  const handleGenerate = useCallback(async () => {
    const result = await generate(imageUrl);
    if (result) {
      onChange(result);
    }
  }, [generate, imageUrl, onChange]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      if (newValue.length <= MAX_LENGTH) {
        onChange(newValue);
      }
    },
    [onChange],
  );

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <label htmlFor="alt-text-input" className="text-sm font-medium">
          Описание изображения (alt text)
        </label>
        <span
          className={cn(
            "text-xs",
            value.length > MAX_LENGTH * 0.9
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        >
          {value.length}/{MAX_LENGTH}
        </span>
      </div>

      <Textarea
        id="alt-text-input"
        value={value}
        onChange={handleChange}
        placeholder="Опишите изображение для screen reader..."
        rows={3}
        maxLength={MAX_LENGTH}
        className="resize-none min-h-[44px]"
        aria-label="Alt text для изображения"
      />

      <Button
        variant="outline"
        size="sm"
        onClick={handleGenerate}
        disabled={loading || !imageUrl}
        className="min-h-[44px] gap-2"
        aria-label="Сгенерировать AI описание"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
        {loading ? "Генерация..." : "✨ Сгенерировать AI описание"}
      </Button>

      <p className="text-xs text-muted-foreground">
        Alt text помогает людям с нарушениями зрения понять содержание изображения
      </p>
    </div>
  );
}
