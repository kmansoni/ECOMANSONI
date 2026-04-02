/**
 * SellerRatingBadge — компактный бейдж с рейтингом продавца (звёздочки + число).
 */

import { Star } from 'lucide-react';
import { useSellerRating } from '@/hooks/useSellerRating';

interface SellerRatingBadgeProps {
  sellerId: string;
  size?: 'sm' | 'md';
  showCount?: boolean;
}

export function SellerRatingBadge({ sellerId, size = 'sm', showCount = true }: SellerRatingBadgeProps) {
  const { rating, loading } = useSellerRating(sellerId);

  if (loading) {
    return (
      <div className="flex items-center gap-1 animate-pulse">
        <div className="w-4 h-4 bg-zinc-700 rounded" />
        <div className="w-8 h-3 bg-zinc-700 rounded" />
      </div>
    );
  }

  if (rating.count === 0) {
    return (
      <span className="text-zinc-500 text-xs">Нет отзывов</span>
    );
  }

  const starSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';
  const fullStars = Math.floor(rating.average);
  const hasHalf = rating.average - fullStars >= 0.5;

  return (
    <div className="flex items-center gap-1" aria-label={`Рейтинг ${rating.average} из 5`}>
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map(i => (
          <Star
            key={i}
            className={`${starSize} ${
              i <= fullStars
                ? 'fill-yellow-400 text-yellow-400'
                : i === fullStars + 1 && hasHalf
                  ? 'fill-yellow-400/50 text-yellow-400'
                  : 'text-zinc-600'
            }`}
          />
        ))}
      </div>
      <span className={`text-white font-medium ${textSize}`}>
        {rating.average.toFixed(1)}
      </span>
      {showCount && (
        <span className={`text-zinc-500 ${textSize}`}>
          ({rating.count})
        </span>
      )}
    </div>
  );
}
