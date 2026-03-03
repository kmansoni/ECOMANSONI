import { useState } from 'react';
import { X } from 'lucide-react';
import type { PinnedMessage } from '@/hooks/usePinnedMessages';

interface PinnedMessageBarProps {
  pinnedMessages: PinnedMessage[];
  onScrollTo: (messageId: string) => void;
  onLongPress?: () => void;
}

export function PinnedMessageBar({ pinnedMessages, onScrollTo, onLongPress }: PinnedMessageBarProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hidden, setHidden] = useState(false);

  if (!pinnedMessages.length || hidden) return null;

  const current = pinnedMessages[currentIndex % pinnedMessages.length];
  const count = pinnedMessages.length;

  const handleClick = () => {
    onScrollTo(current.message_id);
    if (count > 1) {
      setCurrentIndex((prev) => (prev + 1) % count);
    }
  };

  // Long press support
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;

  const handlePointerDown = () => {
    if (!onLongPress) return;
    longPressTimer = setTimeout(() => {
      onLongPress();
      longPressTimer = null;
    }, 600);
  };

  const handlePointerUp = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  const preview = current.content?.trim() || (current.media_type ? `[${current.media_type}]` : 'Сообщение');

  return (
    <div className="flex-shrink-0 bg-muted/80 backdrop-blur-sm border-b border-white/10 px-3 h-10 flex items-center gap-2">
      <span className="text-base shrink-0" aria-hidden>📌</span>
      <button
        className="flex-1 flex items-center gap-2 min-w-0 text-left"
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="text-sm text-foreground truncate leading-tight">{preview}</span>
        {count > 1 && (
          <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
            {(currentIndex % count) + 1} из {count}
          </span>
        )}
      </button>
      <button
        className="shrink-0 p-1 rounded-md hover:bg-white/10 transition-colors"
        onClick={() => setHidden(true)}
        aria-label="Скрыть"
      >
        <X className="w-4 h-4 text-muted-foreground" />
      </button>
    </div>
  );
}
