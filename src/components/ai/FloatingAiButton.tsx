import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FloatingAiButtonProps {
  onClick: () => void;
}

export function FloatingAiButton({ onClick }: FloatingAiButtonProps) {
  return (
    <Button
      onClick={onClick}
      variant="secondary"
      className="fixed bottom-28 right-4 z-50 h-14 w-14 rounded-full shadow-lg \
                 bg-primary text-primary-foreground hover:bg-primary/90\
                 animate-fade-in hover:scale-110 transition-all duration-200\
                 flex items-center justify-center"
      aria-label="AI чат"
    >
      <Bot className="h-6 w-6" />
    </Button>
  );
}
