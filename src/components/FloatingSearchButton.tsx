import { Search, Command } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FloatingSearchButtonProps {
  onClick: () => void;
}

export function FloatingSearchButton({ onClick }: FloatingSearchButtonProps) {
  return (
    <Button
      onClick={onClick}
      variant="secondary"
      className="fixed bottom-28 right-4 z-50 h-14 w-14 rounded-full shadow-lg 
                 bg-primary text-primary-foreground hover:bg-primary/90
                 animate-fade-in hover:scale-110 transition-all duration-200
                 flex items-center justify-center"
    >
      <div className="relative">
        <Search className="h-6 w-6" />
        <div className="absolute -top-1 -right-1 bg-background rounded px-1 py-0.5 
                       flex items-center gap-0.5 text-[8px] font-medium text-foreground
                       shadow-sm border">
          <Command className="h-2 w-2" />
          <span>K</span>
        </div>
      </div>
    </Button>
  );
}
