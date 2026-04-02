/**
 * src/components/chat/QuickReplyBar.tsx — Панель быстрых ответов в ChatInputBar.
 *
 * Появляется когда пользователь вводит "/" в начале ввода.
 * Фильтрует шаблоны по введённому тексту после "/".
 * Клик по шаблону вставляет текст в input.
 */

import { useMemo } from "react";
import { Zap } from "lucide-react";
import type { QuickReply } from "@/hooks/useQuickReplies";

interface QuickReplyBarProps {
  replies: QuickReply[];
  filterText: string;
  onSelect: (text: string) => void;
}

export function QuickReplyBar({ replies, filterText, onSelect }: QuickReplyBarProps) {
  const filtered = useMemo(() => {
    const query = filterText.toLowerCase();
    if (!query) return replies.slice(0, 8);
    return replies
      .filter(
        (r) =>
          r.shortcut.toLowerCase().includes(query) ||
          r.title.toLowerCase().includes(query),
      )
      .slice(0, 8);
  }, [replies, filterText]);

  if (filtered.length === 0) return null;

  return (
    <div
      className="absolute bottom-full left-0 right-0 mb-1 bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-lg z-20"
      role="listbox"
      aria-label="Быстрые ответы"
    >
      <div className="px-3 py-1.5 border-b border-white/5 flex items-center gap-1.5">
        <Zap className="w-3 h-3 text-amber-400" />
        <span className="text-xs text-white/40">Быстрые ответы</span>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {filtered.map((reply) => (
          <button
            key={reply.id}
            type="button"
            role="option"
            onClick={() => onSelect(reply.text)}
            className="w-full text-left px-3 py-2 hover:bg-white/5 active:bg-white/10 transition-colors flex items-start gap-2 min-h-[44px]"
          >
            <span className="text-xs text-cyan-400 font-mono shrink-0 mt-0.5">
              {reply.shortcut}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white/90 font-medium truncate">{reply.title}</p>
              <p className="text-xs text-white/40 truncate">{reply.text}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
