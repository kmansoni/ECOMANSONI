/**
 * src/components/chat/AIAssistantSheet.tsx
 * AI Assistant sliding panel — chat-bot built into every conversation.
 */
import { useEffect, useRef, useState } from "react";
import { Bot, Send, Trash2, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAIAssistant, AIMessage } from "@/hooks/useAIAssistant";
import { useChatOpen } from "@/contexts/ChatOpenContext";
import { cn } from "@/lib/utils";

interface AIAssistantSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass conversationId to scope AI context to a specific chat */
  conversationId?: string;
}

export function AIAssistantSheet({
  open,
  onOpenChange,
  conversationId,
}: AIAssistantSheetProps) {
  const { messages, isLoading, error, sendMessage, getHistory, clearHistory, getUsageInfo } =
    useAIAssistant();
  const { setIsCreatingContent } = useChatOpen();

  const [inputText, setInputText] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [dailyLimit, setDailyLimit] = useState<number | null>(20);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Hide bottom nav when sheet opens
  useEffect(() => {
    setIsCreatingContent(open);
  }, [open, setIsCreatingContent]);

  // Load history and usage when sheet opens
  useEffect(() => {
    if (!open) return;
    void getHistory(conversationId);
    void getUsageInfo().then((info) => {
      setRemaining(info.isPremium ? null : info.dailyLimit! - info.dailyUsed);
      setDailyLimit(info.dailyLimit);
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    setInputText("");

    const result = await sendMessage(text, conversationId);
    if (result) {
      setRemaining(result.remaining);
    }
  };

  const handleClear = async () => {
    await clearHistory(conversationId);
    setRemaining(dailyLimit);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const isLimitReached = remaining !== null && remaining <= 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col w-full sm:max-w-md p-0 gap-0 bg-background"
      >
        {/* Header */}
        <SheetHeader className="flex flex-row items-center justify-between px-4 py-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <SheetTitle className="text-base font-semibold">AI Ассистент</SheetTitle>
          </div>
          <div className="flex items-center gap-2">
            {remaining !== null && (
              <Badge variant={isLimitReached ? "destructive" : "secondary"} className="text-xs">
                {remaining}/{dailyLimit}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleClear}
              title="Очистить историю"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </SheetHeader>

        {/* Messages area */}
        <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef as React.RefObject<never>}>
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
              <Bot className="w-10 h-10 opacity-30" />
              <p className="text-sm">Задайте любой вопрос</p>
            </div>
          )}
          <div className="space-y-3">
            {messages.map((msg: AIMessage) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isLoading && (
              <div className="flex items-start gap-2">
                <Avatar className="w-7 h-7 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">AI</AvatarFallback>
                </Avatar>
                <div className="bg-muted rounded-2xl rounded-tl-sm px-3 py-2 max-w-[75%]">
                  <TypingIndicator />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Error */}
        {error && (
          <div className="px-4 py-2 bg-destructive/10 text-destructive text-xs mx-4 mb-1 rounded-lg">
            {error}
          </div>
        )}

        {/* Limit warning */}
        {isLimitReached && (
          <div className="px-4 py-2 bg-amber-500/10 text-amber-600 text-xs mx-4 mb-1 rounded-lg">
            Дневной лимит сообщений исчерпан. Обновится завтра.
          </div>
        )}

        {/* Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-t shrink-0">
          <Input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isLimitReached ? "Лимит исчерпан" : "Напишите сообщение…"}
            disabled={isLoading || isLimitReached}
            className="flex-1 h-9 text-sm"
          />
          <Button
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={handleSend}
            disabled={isLoading || !inputText.trim() || isLimitReached}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MessageBubble({ message }: { message: AIMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex items-start gap-2", isUser && "flex-row-reverse")}>
      {!isUser && (
        <Avatar className="w-7 h-7 shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary text-xs">AI</AvatarFallback>
        </Avatar>
      )}
      <div
        className={cn(
          "rounded-2xl px-3 py-2 max-w-[75%] text-sm whitespace-pre-wrap break-words",
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-muted text-foreground rounded-tl-sm"
        )}
      >
        {message.content}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}
