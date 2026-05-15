/**
 * BotCard — карточка бота для Marketplace и списков.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Bot as BotIcon, ExternalLink, MessageCircle, Star, Zap } from 'lucide-react';

interface BotCardProps {
  bot: {
    id: string;
    username: string;
    display_name: string;
    description?: string;
    avatar_url?: string;
    is_verified?: boolean;
    status: string;
    language_code?: string;
    rating?: number;
    total_reviews?: number;
    category?: string;
    message_count?: number;
    user_count?: number;
  };
  onClick?: () => void;
  className?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  productivity: 'bg-blue-500/20 text-blue-400',
  entertainment: 'bg-purple-500/20 text-purple-400',
  education: 'bg-green-500/20 text-green-400',
  business: 'bg-yellow-500/20 text-yellow-400',
  utility: 'bg-cyan-500/20 text-cyan-400',
  social: 'bg-pink-500/20 text-pink-400',
  games: 'bg-red-500/20 text-red-400',
  ai: 'bg-indigo-500/20 text-indigo-400',
  default: 'bg-gray-500/20 text-gray-400',
};

const CATEGORY_LABELS: Record<string, string> = {
  productivity: 'Продуктивность',
  entertainment: 'Развлечения',
  education: 'Образование',
  business: 'Бизнес',
  utility: 'Утилиты',
  social: 'Социальные',
  games: 'Игры',
  ai: 'AI',
  default: 'Другое',
};

export function BotCard({ bot, onClick, className }: BotCardProps) {
  const categoryKey = bot.category || 'default';
  const categoryColor = CATEGORY_COLORS[categoryKey] || CATEGORY_COLORS.default;
  const categoryLabel = CATEGORY_LABELS[categoryKey] || 'Другое';
  const rating = bot.rating ?? 0;
  const stars = Math.round(rating);
  const hasReviews = (bot.total_reviews ?? 0) > 0;

  return (
    <Link
      to={`/bot/${bot.username}`}
      onClick={onClick}
      className={cn(
        "group block",
        className
      )}
    >
      <div className={cn(
        "bg-card border rounded-2xl p-5 transition-all duration-200",
        "hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5",
        "group-hover:-translate-y-1"
      )}>
        {/* Header — avatar + status */}
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden relative">
            {bot.avatar_url ? (
              <img
                src={bot.avatar_url}
                alt={bot.display_name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <BotIcon className="w-6 h-6 text-primary" />
            )}
            {bot.is_verified && (
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                <Zap className="w-3 h-3 text-white" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                {bot.display_name}
              </h3>
              {bot.is_verified && (
                <span className="text-[10px] text-primary font-bold">✓</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">@{bot.username}</p>
          </div>
          <div className={cn(
            "px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap",
            bot.status === 'active'
              ? "bg-green-500/15 text-green-500"
              : "bg-muted text-muted-foreground"
          )}>
            {bot.status === 'active' ? 'Онлайн' : bot.status}
          </div>
        </div>

        {/* Категория */}
        <div className="mt-3 flex items-center gap-2">
          <span className={cn(
            "text-[10px] px-2 py-0.5 rounded-full font-medium",
            categoryColor
          )}>
            {categoryLabel}
          </span>
          {bot.language_code && (
            <span className="text-[10px] text-muted-foreground">
              {bot.language_code.toUpperCase()}
            </span>
          )}
        </div>

        {/* Описание */}
        {bot.description && (
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
            {bot.description}
          </p>
        )}

        {/* Статистика + рейтинг */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {bot.message_count != null && (
              <span className="flex items-center gap-1">
                <MessageCircle className="w-3 h-3" />
                {bot.message_count}
              </span>
            )}
            {bot.user_count != null && (
              <span className="text-xs text-muted-foreground">
                {bot.user_count} чел.
              </span>
            )}
          </div>
          {hasReviews && (
            <div className="flex items-center gap-1">
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star
                    key={i}
                    className={cn(
                      "w-3.5 h-3.5",
                      i <= stars ? "fill-primary text-primary" : "text-muted"
                    )}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground ml-1">
                {rating.toFixed(1)} ({bot.total_reviews})
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── Компактная версия для списка ────────────────────────────────
export function BotCardCompact({ bot, onClick }: { bot: BotCardProps['bot']; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 p-3 rounded-xl bg-card border hover:border-primary/50 transition-colors cursor-pointer"
    >
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        {bot.avatar_url ? (
          <img src={bot.avatar_url} alt={bot.display_name} className="w-full h-full rounded-full object-cover" />
        ) : (
          <BotIcon className="w-4 h-4 text-primary" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{bot.display_name}</p>
        <p className="text-xs text-muted-foreground">@{bot.username}</p>
      </div>
      {bot.rating != null && (
        <div className="flex items-center gap-1 shrink-0">
          <Star className="w-3.5 h-3.5 fill-primary text-primary" />
          <span className="text-xs font-medium">{bot.rating.toFixed(1)}</span>
        </div>
      )}
    </div>
  );
}