import React, { useRef } from "react";
import { cn } from "@/lib/utils";
import type { QuickReply } from "@/hooks/useBusinessAccount";

interface QuickRepliesBarProps {
  replies: QuickReply[];
  onSelect: (message: string) => void;
  className?: string;
}

/**
 * Горизонтальный скролл-бар быстрых ответов (chip-кнопки).
 * Размещается над полем ввода в ChatPage.
 * При нажатии вставляет готовый текст в поле ввода через callback onSelect.
 */
export const QuickRepliesBar: React.FC<QuickRepliesBarProps> = ({
  replies,
  onSelect,
  className,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (replies.length === 0) return null;

  return (
    <div
      ref={scrollRef}
      className={cn(
        "flex gap-2 overflow-x-auto scrollbar-hide px-4 py-2",
        "border-t border-white/8 bg-zinc-900/95",
        className
      )}
    >
      {replies.map((reply) => (
        <button
          key={reply.id}
          type="button"
          onClick={() => onSelect(reply.message)}
          className={cn(
            "flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium",
            "bg-accent/15 text-accent border border-accent/30",
            "hover:bg-accent/25 active:scale-95 transition-all duration-150",
            "max-w-[200px] truncate"
          )}
          title={reply.message}
        >
          {reply.text}
        </button>
      ))}
    </div>
  );
};
