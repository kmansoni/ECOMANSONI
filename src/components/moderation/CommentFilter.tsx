/**
 * CommentFilter — фильтрация комментариев по скрытым словам
 */
import React, { useState } from "react";
import { EyeOff, Eye } from "lucide-react";
import { useHiddenWords } from "@/hooks/useHiddenWords";
import { cn } from "@/lib/utils";

interface Props {
  text: string;
  children: React.ReactNode;
  forceShow?: boolean;
}

/**
 * Обёртка вокруг контента комментария.
 * Скрывает, если текст содержит запрещённые слова.
 */
export function CommentFilter({ text, children, forceShow = false }: Props) {
  const { checkText } = useHiddenWords();
  const [revealed, setRevealed] = useState(false);

  const isHidden = !forceShow && !revealed && checkText(text);

  if (!isHidden) return <>{children}</>;

  return (
    <div className="flex items-center gap-2 py-1">
      <div className="flex items-center gap-1.5 text-white/30 text-sm italic">
        <EyeOff className="w-3.5 h-3.5 flex-shrink-0" />
        <span>Скрытый комментарий</span>
      </div>
      <button
        onClick={() => setRevealed(true)}
        className="text-xs text-primary underline flex items-center gap-1"
      >
        <Eye className="w-3 h-3" />
        Показать
      </button>
    </div>
  );
}

/**
 * Хук для проверки текста на скрытые слова
 */
export { useHiddenWords };
