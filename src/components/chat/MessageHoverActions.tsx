import { Reply, Smile, Pin, Forward, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface MessageHoverActionsProps {
  isOwn: boolean;
  onReply: () => void;
  onReact: () => void;
  onPin: () => void;
  onForward: () => void;
  onDelete: () => void;
}

export function MessageHoverActions({
  isOwn,
  onReply,
  onReact,
  onPin,
  onForward,
  onDelete,
}: MessageHoverActionsProps) {
  const isMobile = useIsMobile();
  if (isMobile) return null;

  const actions = [
    { icon: Reply, label: "Ответить", onClick: onReply },
    { icon: Smile, label: "Реакция", onClick: onReact },
    { icon: Pin, label: "Закрепить", onClick: onPin },
    { icon: Forward, label: "Переслать", onClick: onForward },
    ...(isOwn ? [{ icon: Trash2, label: "Удалить", onClick: onDelete }] : []),
  ];

  return (
    <div
      className={cn(
        "absolute top-0 flex items-center gap-0.5 px-1 py-0.5 rounded-lg",
        "bg-background/90 backdrop-blur-sm border border-border/50 shadow-sm",
        "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
        "z-20",
        isOwn ? "right-full mr-1" : "left-full ml-1"
      )}
    >
      {actions.map(({ icon: Icon, label, onClick }) => (
        <button
          key={label}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className="p-1.5 rounded-md hover:bg-accent/80 transition-colors text-muted-foreground hover:text-foreground"
          title={label}
          aria-label={label}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}
