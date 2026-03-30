import { cn } from "@/lib/utils";

interface TypingDotsProps {
  className?: string;
}

export function TypingDots({ className }: TypingDotsProps) {
  return (
    <span className={cn("inline-flex items-center gap-[3px]", className)} aria-label="печатает">
      <span className="typing-dot w-[5px] h-[5px] rounded-full bg-current opacity-40 animate-typing-bounce" style={{ animationDelay: "0ms" }} />
      <span className="typing-dot w-[5px] h-[5px] rounded-full bg-current opacity-40 animate-typing-bounce" style={{ animationDelay: "150ms" }} />
      <span className="typing-dot w-[5px] h-[5px] rounded-full bg-current opacity-40 animate-typing-bounce" style={{ animationDelay: "300ms" }} />
    </span>
  );
}
