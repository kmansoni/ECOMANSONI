/**
 * BotKeyboard — рендеринг inline/reply клавиатур бота
 */

import React from 'react';
import { cn } from '@/lib/utils';

interface BotKeyboardProps {
  replyMarkup?: Record<string, unknown>;
  onButtonClick?: (text: string, callbackData?: string) => void;
}

export function BotKeyboard({ replyMarkup, onButtonClick }: BotKeyboardProps) {
  if (!replyMarkup) return null;

  const inlineKeyboard = (replyMarkup as any).inline_keyboard as Record<string, unknown>[][] | undefined;
  const keyboard = (replyMarkup as any).keyboard as Record<string, unknown>[][] | undefined;

  if (!inlineKeyboard && !keyboard) return null;

  const rows = inlineKeyboard || keyboard || [];

  return (
    <div className="flex flex-col gap-1 mt-2 w-full max-w-[340px]">
      {rows.map((row: Record<string, unknown>[], rowIdx: number) => (
        <div key={rowIdx} className="flex gap-1 w-full">
          {row.map((btn: Record<string, unknown>, btnIdx: number) => {
            const text = btn.text as string;
            const url = btn.url as string | undefined;
            const callbackData = btn.callback_data as string | undefined;
            const webApp = btn.web_app as { url?: string } | undefined;

            const handleClick = () => {
              if (url) {
                window.open(url, '_blank');
              } else {
                onButtonClick?.(text, callbackData);
              }
            };

            return (
              <button
                key={btnIdx}
                onClick={handleClick}
                className={cn(
                  "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  "bg-secondary/60 hover:bg-secondary text-secondary-foreground",
                  "border border-border/40 hover:border-primary/40",
                  "shadow-sm active:scale-[0.97]",
                  url && "text-primary underline decoration-primary/40"
                )}
              >
                {text}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}