/**
 * src/components/feed/AIHashtagSuggestions.tsx
 *
 * Компонент для AI-подбора хэштегов при создании поста.
 * Показывается под полем описания, кнопка "Подобрать", чипы-теги.
 */
import { useCallback } from "react";
import { Sparkles, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAIHashtags } from "@/hooks/useAIHashtags";

// ── Props ────────────────────────────────────────────────────────────

interface AIHashtagSuggestionsProps {
  caption: string;
  onAddHashtag: (hashtag: string) => void;
  addedHashtags?: Set<string>;
  className?: string;
}

// ── Компонент ────────────────────────────────────────────────────────

export function AIHashtagSuggestions({
  caption,
  onAddHashtag,
  addedHashtags = new Set(),
  className,
}: AIHashtagSuggestionsProps) {
  const { suggest, suggestions, loading } = useAIHashtags();

  const handleSuggest = useCallback(async () => {
    await suggest(caption);
  }, [suggest, caption]);

  const handleTagClick = useCallback(
    (tag: string) => {
      onAddHashtag(tag);
    },
    [onAddHashtag],
  );

  return (
    <div className={cn("space-y-2", className)}>
      {/* Кнопка запуска */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleSuggest}
        disabled={loading || caption.trim().length < 3}
        className="min-h-[44px] gap-2"
        aria-label="Подобрать хэштеги с помощью AI"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
        {loading ? "Подбираем..." : "✨ Подобрать хэштеги"}
      </Button>

      {/* Подсказки */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="list" aria-label="Предложенные хэштеги">
          {suggestions.map((tag) => {
            const isAdded = addedHashtags.has(tag);
            return (
              <button
                key={tag}
                onClick={() => handleTagClick(tag)}
                disabled={isAdded}
                role="listitem"
                aria-label={isAdded ? `#${tag} (добавлен)` : `Добавить #${tag}`}
                className="group"
              >
                <Badge
                  variant={isAdded ? "secondary" : "outline"}
                  className={cn(
                    "cursor-pointer transition-all text-xs min-h-[32px]",
                    isAdded
                      ? "opacity-50"
                      : "hover:bg-primary hover:text-primary-foreground active:scale-95",
                  )}
                >
                  <span>#{tag}</span>
                  {isAdded && <X className="w-3 h-3 ml-1" />}
                </Badge>
              </button>
            );
          })}
        </div>
      )}

      {/* Подсказка если мало текста */}
      {caption.trim().length > 0 && caption.trim().length < 3 && (
        <p className="text-xs text-muted-foreground">
          Введите минимум 3 символа для подбора хэштегов
        </p>
      )}
    </div>
  );
}
