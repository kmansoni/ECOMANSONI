import { useState, useCallback } from 'react';
import { Star, Loader2, ThumbsUp, ThumbsDown, Send, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAgencyReviews } from '@/hooks/useAgencyReviews';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

function RatingStars({ rating, size = 'sm', interactive = false, onChange }: {
  rating: number;
  size?: 'sm' | 'lg';
  interactive?: boolean;
  onChange?: (rating: number) => void;
}) {
  const starSize = size === 'lg' ? 'w-7 h-7' : 'w-4 h-4';
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label={`Рейтинг: ${rating} из 5`}>
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          disabled={!interactive}
          onClick={() => onChange?.(i)}
          className={cn(
            interactive && 'cursor-pointer hover:scale-110 transition-transform min-h-[44px] min-w-[44px] flex items-center justify-center',
            !interactive && 'cursor-default p-0',
          )}
          aria-label={interactive ? `Поставить ${i} ${i === 1 ? 'звезду' : 'звёзд'}` : undefined}
          tabIndex={interactive ? 0 : -1}
        >
          <Star
            className={cn(
              starSize,
              i <= rating ? 'fill-yellow-400 text-yellow-400' : 'fill-none text-muted-foreground/40',
            )}
          />
        </button>
      ))}
    </div>
  );
}

function ReviewSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="w-16 h-8" />
        <Skeleton className="w-24 h-4" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-2 py-3 border-b border-border last:border-0">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

interface AgencyReviewsProps {
  agencyId: string;
  agencyName?: string;
}

export function AgencyReviews({ agencyId, agencyName }: AgencyReviewsProps) {
  const { user } = useAuth();
  const {
    reviews,
    isLoading,
    avgRating,
    reviewCount,
    userReview,
    addReview,
    isAddingReview,
    fetchMore,
    hasMore,
    isFetchingMore,
  } = useAgencyReviews(agencyId);

  const [showForm, setShowForm] = useState(false);
  const [formRating, setFormRating] = useState(userReview?.rating ?? 0);
  const [formText, setFormText] = useState(userReview?.text ?? '');
  const [formPros, setFormPros] = useState(userReview?.pros ?? '');
  const [formCons, setFormCons] = useState(userReview?.cons ?? '');

  const handleSubmit = useCallback(async () => {
    if (formRating === 0) return;

    try {
      await addReview({
        rating: formRating,
        text: formText.trim() || undefined,
        pros: formPros.trim() || undefined,
        cons: formCons.trim() || undefined,
      });
      setShowForm(false);
    } catch {
      // toast уже показан в хуке
    }
  }, [formRating, formText, formPros, formCons, addReview]);

  if (isLoading) return <ReviewSkeleton />;

  return (
    <div className="flex flex-col">
      {/* Заголовок со средним рейтингом */}
      <div className="px-4 py-4 border-b border-border">
        <h2 className="text-base font-semibold text-foreground mb-2">
          Отзывы{agencyName ? ` о ${agencyName}` : ''}
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-3xl font-bold text-foreground">
            {avgRating > 0 ? avgRating.toFixed(1) : '—'}
          </span>
          <div>
            <RatingStars rating={Math.round(avgRating)} />
            <p className="text-xs text-muted-foreground mt-0.5">
              {reviewCount === 0
                ? 'Нет отзывов'
                : `${reviewCount} ${reviewCount === 1 ? 'отзыв' : reviewCount < 5 ? 'отзыва' : 'отзывов'}`}
            </p>
          </div>
        </div>
      </div>

      {/* Кнопка «Написать отзыв» */}
      {user && (
        <div className="px-4 py-3 border-b border-border">
          <Button
            variant={showForm ? 'secondary' : 'default'}
            size="sm"
            className="w-full min-h-[44px]"
            onClick={() => setShowForm(prev => !prev)}
            aria-expanded={showForm}
            aria-label="Написать отзыв"
          >
            {userReview ? 'Редактировать отзыв' : 'Написать отзыв'}
          </Button>
        </div>
      )}

      {/* Форма отзыва */}
      {showForm && (
        <div className="px-4 py-4 border-b border-border bg-accent/20 space-y-3">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Оценка *</label>
            <RatingStars rating={formRating} size="lg" interactive onChange={setFormRating} />
          </div>

          <div>
            <label htmlFor="review-text" className="text-sm font-medium text-foreground mb-1 block">
              Отзыв
            </label>
            <Textarea
              id="review-text"
              value={formText}
              onChange={e => setFormText(e.target.value)}
              placeholder="Расскажите о вашем опыте..."
              className="min-h-[80px] resize-none"
              maxLength={2000}
            />
          </div>

          <div>
            <label htmlFor="review-pros" className="text-sm font-medium text-foreground mb-1 flex items-center gap-1">
              <ThumbsUp className="w-3.5 h-3.5 text-green-500" aria-hidden="true" />
              Плюсы
            </label>
            <Textarea
              id="review-pros"
              value={formPros}
              onChange={e => setFormPros(e.target.value)}
              placeholder="Что понравилось?"
              className="min-h-[60px] resize-none"
              maxLength={1000}
            />
          </div>

          <div>
            <label htmlFor="review-cons" className="text-sm font-medium text-foreground mb-1 flex items-center gap-1">
              <ThumbsDown className="w-3.5 h-3.5 text-red-500" aria-hidden="true" />
              Минусы
            </label>
            <Textarea
              id="review-cons"
              value={formCons}
              onChange={e => setFormCons(e.target.value)}
              placeholder="Что не понравилось?"
              className="min-h-[60px] resize-none"
              maxLength={1000}
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={formRating === 0 || isAddingReview}
            className="w-full min-h-[44px]"
            aria-label="Отправить отзыв"
          >
            {isAddingReview ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            {userReview ? 'Обновить отзыв' : 'Отправить'}
          </Button>
        </div>
      )}

      {/* Список отзывов */}
      {reviews.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <Star className="w-10 h-10 text-muted-foreground mb-3" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Пока нет отзывов. Будьте первым!</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {reviews.map(review => (
            <div key={review.id} className="px-4 py-4">
              <div className="flex items-center justify-between mb-1">
                <RatingStars rating={review.rating} />
                <span className="text-xs text-muted-foreground">{formatDate(review.created_at)}</span>
              </div>

              {review.text && (
                <p className="text-sm text-foreground mt-2">{review.text}</p>
              )}

              {review.pros && (
                <div className="mt-2 flex gap-1.5 text-xs">
                  <ThumbsUp className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-muted-foreground">{review.pros}</span>
                </div>
              )}

              {review.cons && (
                <div className="mt-1 flex gap-1.5 text-xs">
                  <ThumbsDown className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-muted-foreground">{review.cons}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Загрузить ещё */}
      {hasMore && (
        <div className="px-4 py-3 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="w-full min-h-[44px]"
            onClick={() => fetchMore()}
            disabled={isFetchingMore}
            aria-label="Загрузить ещё отзывы"
          >
            {isFetchingMore ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <ChevronDown className="w-4 h-4 mr-2" />
            )}
            Ещё отзывы
          </Button>
        </div>
      )}
    </div>
  );
}
