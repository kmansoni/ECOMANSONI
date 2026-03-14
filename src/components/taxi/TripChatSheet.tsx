/**
 * TripChatSheet — чат между водителем и пассажиром в ходе поездки.
 *
 * Паттерн Uber/Яндекс Go: in-trip messaging с быстрыми ответами.
 *
 * Особенности:
 *   - Quick replies одним нажатием (как в Яндекс Go)
 *   - Маскированные идентичности (показываем "Водитель" / "Пассажир")
 *   - Реальный чат через conversationId (driverChat.ts getOrCreateTripChat)
 *   - Закрывается автоматически через 1 час после завершения поездки
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type TripChatMessage,
  QUICK_REPLIES_DRIVER,
  QUICK_REPLIES_PASSENGER,
  subscribeTripChat,
  sendTripMessage,
} from "@/lib/taxi/driverChat";

interface TripChatSheetProps {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  role: "passenger" | "driver";
  currentUserId: string;
}

export function TripChatSheet({
  open,
  onClose,
  conversationId,
  role,
  currentUserId,
}: TripChatSheetProps) {
  const [messages, setMessages] = useState<TripChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Subscribe to realtime messages
  useEffect(() => {
    if (!open) return;
    const unsub = subscribeTripChat(conversationId, (msg) => {
      setMessages((prev) => {
        // Deduplicate by id
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });
    return unsub;
  }, [open, conversationId]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async (text?: string) => {
    const body = (text ?? input).trim();
    if (!body || sending) return;
    setSending(true);
    setInput("");
    try {
      await sendTripMessage(conversationId, body);
      // Optimistic add
      setMessages((prev) => [
        ...prev,
        {
          id: `opt_${Date.now()}`,
          senderId: currentUserId,
          senderRole: role,
          body,
          createdAt: new Date().toISOString(),
          isRead: false,
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [input, sending, conversationId, currentUserId, role]);

  const quickReplies = role === "driver" ? QUICK_REPLIES_DRIVER : QUICK_REPLIES_PASSENGER;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="h-[70vh] flex flex-col bg-zinc-950 text-white border-zinc-800 p-0">
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-white flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-green-400" />
              {role === "driver" ? "Чат с пассажиром" : "Чат с водителем"}
            </SheetTitle>
            <Button variant="ghost" size="icon" className="text-zinc-400" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </SheetHeader>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {messages.length === 0 && (
            <div className="text-center py-8 text-zinc-600 text-sm">
              Сообщений пока нет. Напишите первым!
            </div>
          )}
          {messages.map((msg) => {
            const isOwn = msg.senderId === currentUserId;
            return (
              <div key={msg.id} className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] px-3 py-2 rounded-2xl text-sm",
                    isOwn
                      ? "bg-green-700 text-white rounded-br-sm"
                      : "bg-zinc-800 text-zinc-100 rounded-bl-sm"
                  )}
                >
                  <p>{msg.body}</p>
                  <p className={cn("text-xs mt-0.5", isOwn ? "text-green-200" : "text-zinc-500")}>
                    {new Date(msg.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Quick replies */}
        <div className="px-4 py-2 border-t border-zinc-800 flex-shrink-0">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {quickReplies.map((reply) => (
              <button
                key={reply}
                onClick={() => handleSend(reply)}
                disabled={sending}
                className="whitespace-nowrap text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-full border border-zinc-700 transition-colors shrink-0"
              >
                {reply}
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="px-4 pb-4 pt-2 flex gap-2 flex-shrink-0">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, 300))}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Сообщение..."
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-white text-sm outline-none focus:border-green-600 transition-colors"
          />
          <Button
            size="icon"
            onClick={() => handleSend()}
            disabled={!input.trim() || sending}
            className="bg-green-600 hover:bg-green-700 text-white rounded-xl"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
