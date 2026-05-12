/**
 * @file src/components/reels/ReelAvatarSticker.tsx
 * @description Аватарка автора с badge-стикером (верфицированный / новый автор / платный контент).
 * Используется как overlay-элемент поверх видео.
 */

import React, { memo } from 'react';
import { Crown, Sparkles, BadgeCheck } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { ReelAuthor } from '@/types/reels';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReelAvatarStickerProps {
  author: ReelAuthor;
  /** Тип стикера для отображения */
  badge?: 'verified' | 'new' | 'premium' | 'trending';
  /** Размер аватара в px */
  size?: number;
  /** onClick по аватарке */
  onClick?: (authorId: string) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Badge config
// ---------------------------------------------------------------------------

const badgeConfig = {
  verified: {
    icon: BadgeCheck,
    bg: 'bg-blue-500',
    tooltip: 'Верифицированный аккаунт',
  },
  new: {
    icon: Sparkles,
    bg: 'bg-purple-500',
    tooltip: 'Новый автор',
  },
  premium: {
    icon: Crown,
    bg: 'bg-yellow-500',
    tooltip: 'Премиум-контент',
  },
  trending: {
    icon: Sparkles,
    bg: 'bg-orange-500',
    tooltip: 'Тренд',
  },
} as const;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const ReelAvatarSticker = memo<ReelAvatarStickerProps>(({
  author,
  badge,
  size = 40,
  onClick,
  className,
}) => {
  const badgeInfo = badge ? badgeConfig[badge] : null;
  const isSmall = size <= 32;

  return (
    <button
      type="button"
      onClick={() => onClick?.(author.id)}
      className={cn(
        'relative inline-flex items-center justify-center rounded-full overflow-hidden',
        'border-2 border-white/30 hover:border-white/60',
        'active:scale-90 transition-transform duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
        className,
      )}
      style={{ width: size, height: size }}
      aria-label={`Профиль @${author.username}`}
    >
      {/* Аватар */}
      {author.avatar_url ? (
        <img
          src={author.avatar_url}
          alt={author.username}
          className="w-full h-full object-cover"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div
          className="w-full h-full bg-gradient-to-br from-zinc-600 to-zinc-800 flex items-center justify-center"
        >
          <span className="text-white font-bold" style={{ fontSize: size * 0.4 }}>
            {author.username.charAt(0).toUpperCase()}
          </span>
        </div>
      )}

      {/* Badge стикер (правый нижний угол) */}
      {badgeInfo && (
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 rounded-full p-0.5',
            badgeInfo.bg,
            'ring-2 ring-black/60',
            isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4',
          )}
          aria-label={badgeInfo.tooltip}
          title={badgeInfo.tooltip}
        >
          <badgeInfo.icon
            size={isSmall ? 8 : 10}
            className="text-white stroke-[2.5]"
          />
        </span>
      )}
    </button>
  );
});

ReelAvatarSticker.displayName = 'ReelAvatarSticker';

export { ReelAvatarSticker };
export type { ReelAvatarStickerProps };