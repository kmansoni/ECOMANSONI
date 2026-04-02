/**
 * src/components/chat/BroadcastChannelView.tsx
 *
 * Полноэкранный вид broadcast-канала.
 * Read-only для подписчиков, input для creator.
 * Реакции разрешены всем.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowLeft, Send, Users, Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { GradientAvatar } from "@/components/ui/gradient-avatar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  useBroadcastMessages,
  type BroadcastChannel,
  type BroadcastMessage,
} from "@/hooks/useBroadcastChannels";
import { useBroadcastChannels } from "@/hooks/useBroadcastChannels";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { logger } from "@/lib/logger";

// ── Props ────────────────────────────────────────────────────────────

interface BroadcastChannelViewProps {
  channel: BroadcastChannel;
  onBack: () => void;
}

// ── Компонент ────────────────────────────────────────────────────────

export function BroadcastChannelView({ channel, onBack }: BroadcastChannelViewProps) {
  const { user } = useAuth();
  const isCreator = user?.id === channel.creator_id;
  const { messages, loading: messagesLoading } = useBroadcastMessages(channel.id);
  const { joinChannel, leaveChannel, joinedChannels, sendMessage } = useBroadcastChannels();

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isJoined = joinedChannels.some((c) => c.id === channel.id) || isCreator;

  // Автоскролл при новых сообщениях
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const result = await sendMessage(channel.id, text);
    if (result) {
      setText("");
      inputRef.current?.focus();
    }
    setSending(false);
  }, [text, sending, sendMessage, channel.id]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const handleToggleSubscription = useCallback(async () => {
    if (isCreator) return;
    if (isJoined) {
      await leaveChannel(channel.id);
    } else {
      await joinChannel(channel.id);
    }
  }, [isCreator, isJoined, leaveChannel, joinChannel, channel.id]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-card shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label="Назад"
          className="min-h-[44px] min-w-[44px]"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>

        <GradientAvatar
          name={channel.name}
          avatarUrl={channel.avatar_url}
          size="md"
        />

        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold truncate">{channel.name}</h2>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="w-3 h-3" />
            <span>{channel.member_count} подписчиков</span>
          </div>
        </div>

        {!isCreator && (
          <Button
            variant={isJoined ? "outline" : "default"}
            size="sm"
            onClick={handleToggleSubscription}
            className="min-h-[44px]"
            aria-label={isJoined ? "Отписаться" : "Подписаться"}
          >
            {isJoined ? (
              <>
                <BellOff className="w-4 h-4 mr-1" />
                Отписаться
              </>
            ) : (
              <>
                <Bell className="w-4 h-4 mr-1" />
                Подписаться
              </>
            )}
          </Button>
        )}
      </div>

      {/* Описание */}
      {channel.description && (
        <div className="px-4 py-2 text-xs text-muted-foreground border-b bg-muted/30">
          {channel.description}
        </div>
      )}

      {/* Сообщения */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messagesLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-3/4" />
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="h-16 w-4/5" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-2">
            <Users className="w-12 h-12 opacity-50" />
            <p className="text-sm">
              {isCreator ? "Отправьте первое сообщение подписчикам" : "Пока нет сообщений"}
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <BroadcastMessageBubble key={msg.id} message={msg} />
          ))
        )}
      </div>

      {/* Input (только для creator) */}
      {isCreator && (
        <div className="flex items-center gap-2 px-4 py-3 border-t bg-card shrink-0 pb-safe">
          <Input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Напишите сообщение подписчикам..."
            className="flex-1 min-h-[44px]"
            maxLength={4096}
            aria-label="Текст сообщения"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!text.trim() || sending}
            aria-label="Отправить"
            className="min-h-[44px] min-w-[44px]"
          >
            {sending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>
      )}

      {/* Подсказка для неподписанных */}
      {!isCreator && !isJoined && (
        <div className="flex items-center justify-center px-4 py-3 border-t bg-muted/50 shrink-0 pb-safe">
          <p className="text-sm text-muted-foreground">
            Подпишитесь, чтобы получать новые сообщения
          </p>
        </div>
      )}
    </div>
  );
}

// ── Bubble сообщения ─────────────────────────────────────────────────

function BroadcastMessageBubble({ message }: { message: BroadcastMessage }) {
  const timeStr = (() => {
    try {
      return format(new Date(message.created_at), "d MMM, HH:mm", { locale: ru });
    } catch (e) {
      logger.error("[BroadcastMessageBubble] Ошибка форматирования даты", { error: e });
      return "";
    }
  })();

  return (
    <div className="bg-card border rounded-xl px-4 py-3 max-w-full">
      <p className="text-sm whitespace-pre-wrap break-words">{message.text}</p>
      {message.media_url && (
        <img
          src={message.media_url}
          alt="Медиа в сообщении"
          className="mt-2 rounded-lg max-h-60 object-cover"
          loading="lazy"
        />
      )}
      <p className="text-xs text-muted-foreground mt-1">{timeStr}</p>
    </div>
  );
}
