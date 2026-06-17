/**
 * @file src/components/reels/ReelTopBar.tsx
 * @description Верхняя панель Reel: аватар автора, кнопка закрытия, меню действий.
 * Instagram/Telegram Premium стиль — полупрозрачный бэкграунд, минималистичные иконки.
 */

import React, { memo, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MoreHorizontal, Share2, Bookmark, Link2, Flag, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { ReelAuthor } from '@/types/reels';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReelTopBarProps {
  author: ReelAuthor;
  /** Виден ли overlay (для fade-анимации) */
  isOverlayVisible: boolean;
  onAuthorPress: (authorId: string) => void;
  onClose: () => void;
  onShare: () => void;
  onMore: () => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Кнопка действия в top bar */
const TopBarAction = memo<{
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  className?: string;
}>(({ icon: Icon, label, onClick, className }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'flex items-center justify-center w-8 h-8 rounded-full',
      'bg-black/40 backdrop-blur-md hover:bg-black/60',
      'active:scale-90 transition-transform duration-150',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
      className,
    )}
    aria-label={label}
  >
    <Icon size={16} className="text-white drop-shadow-sm" />
  </button>
));
TopBarAction.displayName = 'TopBarAction';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const ReelTopBar = memo<ReelTopBarProps>(({
  author,
  isOverlayVisible,
  onAuthorPress,
  onClose,
  onShare,
  onMore,
}) => {
  const [showMenu, setShowMenu] = useState(false);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleShare = useCallback(() => {
    setShowMenu(false);
    onShare();
  }, [onShare]);

  const handleMore = useCallback(() => {
    setShowMenu(false);
    onMore();
  }, [onMore]);

  const handleCopyLink = useCallback(async () => {
    setShowMenu(false);
    const link = `${window.location.origin}/reels/${author.id}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      toast.error('Не удалось скопировать ссылку');
    }
  }, [author.id]);

  return (
    <>
      {/* ── Верхний бар ── */}
      <motion.div
        className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-3 pt-safe-top pt-2 pb-2"
        initial={false}
        animate={{
          opacity: isOverlayVisible ? 1 : 0,
          y: isOverlayVisible ? 0 : -10,
          pointerEvents: isOverlayVisible ? 'auto' : 'none',
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
      >
        {/* Градиент под бэром для читаемости */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-transparent pointer-events-none" />

        <div className="relative flex items-center gap-2 z-10">
          {/* Аватар автора */}
          <button
            type="button"
            onClick={() => onAuthorPress(author.id)}
            className="flex items-center gap-2 group"
            aria-label={`Профиль @${author.username}`}
          >
            <div className="relative">
              <Avatar className="w-8 h-8 rounded-full border border-white/30 ring-2 ring-black/50">
                <AvatarImage src={author.avatar_url ?? undefined} className="object-cover" />
                <AvatarFallback>{author.username.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              {/* Верификация */}
              {author.is_verified && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-blue-500 rounded-full border border-black flex items-center justify-center"
                  aria-label="Верифицированный"
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="white">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                  </svg>
                </span>
              )}
            </div>
            <span className="text-white text-xs font-semibold drop-shadow-md max-w-[100px] truncate">
              @{author.username}
            </span>
          </button>
        </div>

        {/* Правая часть: закрытие + действия */}
        <div className="flex items-center gap-1 z-10">
          <TopBarAction icon={Share2} label="Поделиться" onClick={handleShare} />
          <TopBarAction icon={MoreHorizontal} label="Ещё" onClick={handleMore} />
          <TopBarAction icon={X} label="Закрыть" onClick={handleClose} />
        </div>
      </motion.div>

      {/* ── Action sheet меню ── */}
      <AnimatePresence>
        {showMenu && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/50 z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMenu(false)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 rounded-t-2xl p-4 pb-safe-bottom"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            >
              <div className="w-10 h-1 bg-zinc-600 rounded-full mx-auto mb-4" />
              <button onClick={handleCopyLink} className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-zinc-800 text-white">
                <Copy size={20} /> Скопировать ссылку
              </button>
              <button onClick={() => { setShowMenu(false); }} className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-zinc-800 text-zinc-400">
                <Flag size={20} /> Пожаловаться
              </button>
              <button onClick={() => setShowMenu(false)} className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-zinc-800 text-zinc-400 mt-2">
                <X size={20} /> Отмена
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
});

ReelTopBar.displayName = 'ReelTopBar';

export { ReelTopBar };
export type { ReelTopBarProps };