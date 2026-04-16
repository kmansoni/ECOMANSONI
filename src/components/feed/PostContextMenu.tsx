/**
 * @file src/components/feed/PostContextMenu.tsx
 * @description Long-press контекстное меню для постов — Instagram стиль.
 * Появляется при долгом нажатии на пост в ленте.
 *
 * Архитектура:
 * - Backdrop blur overlay
 * - Превью поста (уменьшенное) + список действий
 * - Анимация: scale + fade in
 * - Действия: лайк, сохранить, поделиться, не показывать, пожаловаться, закрепить
 * - Интеграция с useLongPress hook
 */

import { useState } from "react";
import { Heart, Bookmark, Share2, EyeOff, Flag, Pin, Copy, UserX, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Haptics } from "@/lib/haptics";
import { useLongPress } from "@/hooks/useLongPress";

interface PostContextAction {
  id: string;
  icon: React.ReactNode;
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

interface PostContextMenuProps {
  postId: string;
  isLiked: boolean;
  isSaved: boolean;
  isOwn: boolean;
  isPinned?: boolean;
  thumbnailUrl?: string;
  onLike: () => void;
  onSave: () => void;
  onShare: () => void;
  onHide: () => void;
  onReport: () => void;
  onPin?: () => void;
  onCopyLink: () => void;
  onUnfollow?: () => void;
  children: React.ReactNode;
}

export function PostContextMenu({
  postId,
  isLiked,
  isSaved,
  isOwn,
  isPinned,
  thumbnailUrl,
  onLike,
  onSave,
  onShare,
  onHide,
  onReport,
  onPin,
  onCopyLink,
  onUnfollow,
  children,
}: PostContextMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  const longPressHandlers = useLongPress(
    (e) => {
      setMenuPos({ x: e.clientX, y: e.clientY });
      setIsOpen(true);
    },
    { threshold: 500 }
  );

  const close = () => setIsOpen(false);

  const handleAction = (action: () => void) => {
    close();
    action();
  };

  const actions: PostContextAction[] = [
    {
      id: "like",
      icon: <Heart className={cn("w-5 h-5", isLiked && "fill-red-500 text-red-500")} />,
      label: isLiked ? "Убрать лайк" : "Нравится",
      onPress: () => { Haptics.like(); onLike(); },
    },
    {
      id: "save",
      icon: <Bookmark className={cn("w-5 h-5", isSaved && "fill-current")} />,
      label: isSaved ? "Убрать из сохранённых" : "Сохранить",
      onPress: onSave,
    },
    {
      id: "share",
      icon: <Share2 className="w-5 h-5" />,
      label: "Поделиться",
      onPress: onShare,
    },
    {
      id: "copy",
      icon: <Copy className="w-5 h-5" />,
      label: "Копировать ссылку",
      onPress: () => { Haptics.copy(); onCopyLink(); },
    },
    ...(onPin ? [{
      id: "pin",
      icon: <Pin className={cn("w-5 h-5", isPinned && "fill-current")} />,
      label: isPinned ? "Открепить" : "Закрепить в профиле",
      onPress: onPin,
    }] : []),
    ...(!isOwn ? [
      {
        id: "hide",
        icon: <EyeOff className="w-5 h-5" />,
        label: "Не показывать",
        onPress: onHide,
      },
      ...(onUnfollow ? [{
        id: "unfollow",
        icon: <UserX className="w-5 h-5" />,
        label: "Отписаться",
        destructive: true,
        onPress: onUnfollow,
      }] : []),
      {
        id: "report",
        icon: <Flag className="w-5 h-5" />,
        label: "Пожаловаться",
        destructive: true,
        onPress: onReport,
      },
    ] : []),
  ];

  return (
    <>
      {/* Обёртка с long-press */}
      <div {...longPressHandlers} className="select-none">
        {children}
      </div>

      {/* Контекстное меню */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              onClick={close}
            />

            {/* Меню */}
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="fixed z-50 w-64 bg-card/95 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden"
              style={{
                left: Math.min(menuPos.x - 128, window.innerWidth - 272),
                top: Math.min(menuPos.y - 20, window.innerHeight - (actions.length * 52 + 20)),
              }}
            >
              {/* Превью поста */}
              {thumbnailUrl && (
                <div className="w-full h-32 overflow-hidden">
                  <img loading="lazy" src={thumbnailUrl} alt="" className="w-full h-full object-cover" />
                </div>
              )}

              {/* Действия */}
              <div className="py-1">
                {actions.map((action, i) => (
                  <button
                    key={action.id}
                    onClick={() => handleAction(action.onPress)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors",
                      "hover:bg-muted/50 active:bg-muted",
                      action.destructive ? "text-destructive" : "text-foreground",
                      i > 0 && "border-t border-border/50"
                    )}
                  >
                    {action.icon}
                    {action.label}
                  </button>
                ))}
              </div>

              {/* Кнопка закрытия */}
              <div className="border-t border-border">
                <button
                  onClick={close}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-muted-foreground hover:bg-muted/50"
                >
                  <X className="w-4 h-4" />
                  Отмена
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
