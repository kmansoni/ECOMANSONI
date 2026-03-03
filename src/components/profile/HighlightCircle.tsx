import { Plus } from "lucide-react";
import { motion } from "framer-motion";

interface HighlightCircleProps {
  id?: string;
  title: string;
  coverUrl?: string | null;
  isNew?: boolean;
  onClick?: () => void;
  onLongPress?: () => void;
}

export function HighlightCircle({ title, coverUrl, isNew, onClick, onLongPress }: HighlightCircleProps) {
  let pressTimer: ReturnType<typeof setTimeout> | null = null;

  const handleTouchStart = () => {
    if (!onLongPress) return;
    pressTimer = setTimeout(() => {
      onLongPress();
    }, 600);
  };

  const handleTouchEnd = () => {
    if (pressTimer) clearTimeout(pressTimer);
  };

  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="flex flex-col items-center gap-1.5 min-w-[72px]"
    >
      <div
        className={`w-16 h-16 rounded-full border-2 overflow-hidden flex items-center justify-center ${
          isNew ? "border-dashed border-border bg-muted/50" : "border-transparent ring-2 ring-gradient-to-tr ring-offset-2 ring-offset-background"
        }`}
        style={
          !isNew
            ? {
                background: "linear-gradient(to bottom right, #f9ce34, #ee2a7b, #6228d7)",
                padding: 2,
              }
            : undefined
        }
      >
        {isNew ? (
          <div className="w-full h-full rounded-full bg-muted flex items-center justify-center">
            <Plus className="w-6 h-6 text-foreground" />
          </div>
        ) : (
          <div className="w-full h-full rounded-full overflow-hidden bg-muted">
            {coverUrl ? (
              <img src={coverUrl} alt={title} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500" />
            )}
          </div>
        )}
      </div>
      <span className="text-xs text-foreground text-center w-16 truncate leading-tight">{title}</span>
    </motion.button>
  );
}
