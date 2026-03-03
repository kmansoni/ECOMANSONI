import { Heart, MessageCircle, Send, Bookmark, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  }
  return num.toString();
}

interface ReelSidebarProps {
  reel: any;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onSave: () => void;
  onAuthorClick: () => void;
}

export function ReelSidebar({
  reel,
  onLike,
  onComment,
  onShare,
  onSave,
  onAuthorClick,
}: ReelSidebarProps) {
  return (
    <div
      className="absolute right-3 bottom-4 flex flex-col items-center gap-3 z-10"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Like */}
      <button
        className="flex flex-col items-center gap-1"
        onClick={(e) => { e.stopPropagation(); onLike(); }}
        aria-label={reel.isLiked ? "Убрать лайк" : "Поставить лайк"}
      >
        <div
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200",
            reel.isLiked ? "bg-destructive/20 scale-110" : "bg-white/10 backdrop-blur-sm"
          )}
        >
          <Heart
            className={cn(
              "w-7 h-7 transition-all duration-200",
              reel.isLiked ? "text-destructive fill-destructive scale-110" : "text-white"
            )}
          />
        </div>
        <span className="text-white text-xs font-medium">
          {reel.likes_count > 0 ? formatNumber(reel.likes_count) : ""}
        </span>
      </button>

      {/* Comments */}
      <button
        className="flex flex-col items-center gap-1"
        onClick={(e) => { e.stopPropagation(); onComment(); }}
        aria-label="Открыть комментарии"
      >
        <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <MessageCircle className="w-7 h-7 text-white" />
        </div>
        <span className="text-white text-xs font-medium">
          {reel.comments_count > 0 ? formatNumber(reel.comments_count) : ""}
        </span>
      </button>

      {/* Share */}
      <button
        className="flex flex-col items-center gap-1"
        onClick={(e) => { e.stopPropagation(); onShare(); }}
        aria-label="Поделиться"
      >
        <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <Send className="w-6 h-6 text-white" />
        </div>
        <span className="text-white text-xs font-medium">Отправить</span>
      </button>

      {/* Save */}
      <button
        className="flex flex-col items-center gap-1"
        onClick={(e) => { e.stopPropagation(); onSave(); }}
        aria-label={reel.isSaved ? "Убрать из сохранённых" : "Сохранить"}
      >
        <div
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200",
            reel.isSaved ? "bg-white/20 scale-110" : "bg-white/10 backdrop-blur-sm",
          )}
        >
          <Bookmark
            className={cn(
              "w-6 h-6 transition-all duration-200",
              reel.isSaved ? "text-white fill-white scale-110" : "text-white",
            )}
          />
        </div>
        <span className="text-white text-xs font-medium">
          {(reel.saves_count || 0) > 0 ? formatNumber(reel.saves_count || 0) : ""}
        </span>
      </button>

      {/* Author avatar */}
      <button
        className="relative"
        onClick={(e) => { e.stopPropagation(); onAuthorClick(); }}
        aria-label="Перейти к профилю автора"
      >
        <Avatar className="w-11 h-11 border-2 border-white">
          <AvatarImage src={reel.author?.avatar_url || undefined} />
          <AvatarFallback className="bg-muted">
            <User className="w-5 h-5" />
          </AvatarFallback>
        </Avatar>
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
          <span className="text-primary-foreground text-xs font-bold">+</span>
        </div>
      </button>
    </div>
  );
}
