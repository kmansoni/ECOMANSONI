/**
 * DndIndicator — маленький бейдж 🌙 для отображения рядом с аватаром или в хедере,
 * когда пользователь находится в режиме "Не беспокоить".
 *
 * Props:
 *  - dndUntil?: Date | null — время окончания DND (null = бессрочно)
 *  - className?: string — дополнительные классы для позиционирования
 *  - size?: "sm" | "md" — размер иконки
 */

import React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface DndIndicatorProps {
  dndUntil?: Date | null;
  className?: string;
  size?: "sm" | "md";
}

function formatUntil(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function DndIndicator({ dndUntil, className, size = "sm" }: DndIndicatorProps) {
  const tooltipText = dndUntil
    ? `Не беспокоить до ${formatUntil(dndUntil)}`
    : "Не беспокоить";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={tooltipText}
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-zinc-800 text-white select-none",
            size === "sm" ? "w-4 h-4 text-[10px]" : "w-5 h-5 text-xs",
            className
          )}
        >
          🌙
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="bg-zinc-900 text-white border-white/10 text-xs">
        {tooltipText}
      </TooltipContent>
    </Tooltip>
  );
}
