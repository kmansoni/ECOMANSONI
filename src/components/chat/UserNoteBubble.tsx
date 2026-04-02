/**
 * src/components/chat/UserNoteBubble.tsx — Отображение заметки пользователя.
 *
 * Маленький пузырёк над аватаром в ChatListItem.
 * При тапе — показывает полный текст.
 */

import { useState, useCallback } from "react";

interface UserNoteBubbleProps {
  emoji: string | null;
  text: string;
}

export function UserNoteBubble({ emoji, text }: UserNoteBubbleProps) {
  const [expanded, setExpanded] = useState(false);

  const handleToggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const displayEmoji = emoji ?? "💭";
  const maxPreviewLength = 18;
  const truncatedText = text.length > maxPreviewLength
    ? `${text.slice(0, maxPreviewLength)}…`
    : text;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-1 bg-zinc-800/90 backdrop-blur-sm rounded-full px-2 py-0.5 max-w-[140px] hover:bg-zinc-700/90 transition-colors"
        aria-label={`Заметка: ${text}`}
      >
        <span className="text-xs leading-none">{displayEmoji}</span>
        <span className="text-[11px] text-white/60 truncate leading-tight">
          {truncatedText}
        </span>
      </button>

      {/* Развёрнутый пузырёк */}
      {expanded && text.length > maxPreviewLength && (
        <div
          className="absolute top-full left-0 mt-1 bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 z-30 max-w-[200px] shadow-lg"
          role="tooltip"
        >
          <p className="text-xs text-white/80">
            {displayEmoji} {text}
          </p>
        </div>
      )}
    </div>
  );
}
