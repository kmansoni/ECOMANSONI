/**
 * SpoilerText — инлайн-спойлер: клик для раскрытия скрытого текста.
 * Telegram использует двойные || вокруг текста.
 * Поддерживает вложенность в текст и множественные спойлеры в одном сообщении.
 * Принимает ReactNode для корректной обработки упоминаний (@user) внутри спойлера.
 */
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface SpoilerTextProps {
  children: React.ReactNode;
  className?: string;
}

export function SpoilerText({ children, className }: SpoilerTextProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setRevealed(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setRevealed(true);
        }
      }}
      className={cn(
        "inline-block rounded px-1.5 py-0.5 cursor-pointer transition-all select-none",
        revealed
          ? "bg-white/5 text-white/90"
          : "bg-black/60 hover:bg-black/70",
        className,
      )}
      title={revealed ? undefined : "Нажмите, чтобы увидеть"}
    >
      {revealed ? children : <span className="text-transparent">{"█".repeat(8)}</span>}
    </span>
  );
}