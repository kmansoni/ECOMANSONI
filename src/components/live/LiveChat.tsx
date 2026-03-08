import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Pin, Gift } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LiveChatMessage } from '@/types/livestream';

// Username colour deterministic palette
const USERNAME_COLORS = [
  'text-blue-400',
  'text-green-400',
  'text-yellow-400',
  'text-pink-400',
  'text-purple-400',
  'text-orange-400',
  'text-cyan-400',
];

function userColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return USERNAME_COLORS[Math.abs(hash) % USERNAME_COLORS.length];
}

interface ChatMessageRowProps {
  message: LiveChatMessage;
}

const ChatMessageRow = React.memo(function ChatMessageRow({ message }: ChatMessageRowProps) {
  const isSystem = message.type === 'system';
  const isGift = message.type === 'gift';
  const isQuestion = message.type === 'question';

  const name =
    message.user?.display_name || message.user?.username || 'viewer';
  const avatar = message.user?.avatar_url;
  const initial = name[0]?.toUpperCase() ?? '?';

  if (isSystem) {
    return (
      <div className="py-0.5 text-center text-xs text-white/50 italic">
        {message.message}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'flex items-start gap-1.5 px-2 py-1 rounded-lg',
        isGift && 'bg-yellow-500/20',
        isQuestion && 'bg-blue-500/20',
      )}
    >
      <Avatar className="h-5 w-5 shrink-0 mt-0.5">
        <AvatarImage src={avatar} alt={name} />
        <AvatarFallback className="text-[9px]">{initial}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <span className={cn('text-xs font-semibold mr-1', userColor(message.user_id))}>
          {name}
        </span>
        {isGift && <Gift className="inline h-3 w-3 mr-1 text-yellow-400" aria-hidden />}
        <span className="text-xs text-white/90 break-words">{message.message}</span>
      </div>
    </motion.div>
  );
});

interface LiveChatProps {
  messages: LiveChatMessage[];
  pinnedMessage: LiveChatMessage | null;
  onSend: (text: string) => Promise<void>;
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Scrollable live chat area with pinned message bar, auto-scroll, input.
 * Designed to sit in a semi-transparent overlay over the stream video.
 */
export const LiveChat = React.memo(function LiveChat({
  messages,
  pinnedMessage,
  onSend,
  isLoading = false,
  disabled = false,
  className,
}: LiveChatProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  // Auto-scroll to bottom when new messages arrive (unless scrolled up)
  useEffect(() => {
    if (!atBottomRef.current) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setText('');
    } finally {
      setSending(false);
    }
  }, [text, sending, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Pinned message */}
      {pinnedMessage && (
        <div className="flex items-center gap-2 rounded-t-lg bg-yellow-500/20 px-3 py-1.5 text-xs text-white backdrop-blur-sm border-b border-yellow-500/30">
          <Pin className="h-3 w-3 shrink-0 text-yellow-400" aria-hidden />
          <span className="truncate">{pinnedMessage.message}</span>
        </div>
      )}

      {/* Messages list */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overscroll-contain space-y-0.5 py-1 min-h-0"
        aria-live="polite"
        aria-label="Live chat messages"
      >
        {isLoading && (
          <div className="py-4 text-center text-xs text-white/40">Загрузка чата…</div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <ChatMessageRow key={msg.id} message={msg} />
          ))}
        </AnimatePresence>
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-2 pb-2 pt-1">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Написать сообщение…"
          disabled={disabled || sending}
          maxLength={300}
          className="h-8 bg-black/40 text-xs text-white placeholder:text-white/40 border-white/20 focus:border-white/50 backdrop-blur-sm"
          aria-label="Chat message input"
        />
        <Button
          size="icon"
          onClick={() => void handleSend()}
          disabled={!text.trim() || sending || disabled}
          className="h-8 w-8 shrink-0 bg-red-600 hover:bg-red-500 text-white"
          aria-label="Send message"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
});
