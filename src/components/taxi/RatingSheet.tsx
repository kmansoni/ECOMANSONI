import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useTaxiRating, RATING_TAGS, TIPS_PRESETS } from '@/hooks/taxi';
import { formatTripPrice } from '@/lib/taxi/formatters';

interface RatingSheetProps {
  driverName: string;
  tripPrice: number;
  onSubmit: (rating: number, tip: number, comment?: string) => void;
  onSkip: () => void;
  isSubmitting?: boolean;
  className?: string;
}

export function RatingSheet({
  driverName,
  tripPrice,
  onSubmit,
  onSkip,
  isSubmitting = false,
  className,
}: RatingSheetProps) {
  const {
    stars,
    tip,
    customTip,
    comment,
    selectedTags,
    canSubmit,
    setStars,
    toggleTag,
    setTip,
    setCustomTip,
    setComment,
  } = useTaxiRating();

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(stars, tip, comment || undefined);
  };

  const starLabels = ['', 'Плохо', 'Неплохо', 'Нормально', 'Хорошо', 'Отлично!'];

  return (
    <div className={cn('space-y-5', className)}>
      {/* Заголовок */}
      <div className="text-center">
        <h2 className="text-xl font-bold">Как прошла поездка?</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Оцените водителя {driverName}
        </p>
      </div>

      {/* Звёзды */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStars(value)}
              className={cn(
                'transition-all duration-150',
                'active:scale-90',
                value <= stars ? 'scale-110' : 'opacity-40'
              )}
              aria-label={`${value} звезд`}
            >
              <Star
                className={cn(
                  'h-10 w-10 transition-colors duration-150',
                  value <= stars
                    ? 'fill-amber-400 stroke-amber-400'
                    : 'stroke-gray-300 fill-transparent'
                )}
              />
            </button>
          ))}
        </div>
        {stars > 0 && (
          <span className="text-base font-semibold text-amber-500">
            {starLabels[stars]}
          </span>
        )}
      </div>

      {/* Теги (только если что-то выбрано) */}
      {stars > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Что понравилось?</p>
          <div className="flex flex-wrap gap-2">
            {RATING_TAGS.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm',
                  'border-2 transition-all duration-150',
                  selectedTags.has(tag.id)
                    ? 'bg-blue-50 border-blue-400 text-blue-700 font-medium'
                    : 'bg-background border-border text-foreground hover:border-gray-300'
                )}
              >
                <span>{tag.emoji}</span>
                <span>{tag.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Чаевые */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">Оставить чаевые</p>
        <div className="flex items-center gap-2">
          {TIPS_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setTip(preset)}
              className={cn(
                'flex-1 py-2 rounded-xl text-sm font-semibold',
                'border-2 transition-all duration-150',
                tip === preset && customTip === ''
                  ? 'bg-blue-50 border-blue-400 text-blue-700'
                  : 'bg-background border-border text-foreground hover:border-gray-300'
              )}
            >
              {preset === 0 ? 'Без' : `${preset} ₽`}
            </button>
          ))}
        </div>

        {/* Произвольная сумма */}
        <input
          type="number"
          min="0"
          max="9999"
          placeholder="Другая сумма ₽"
          value={customTip}
          onChange={(e) => setCustomTip(e.target.value)}
          className={cn(
            'mt-2 w-full px-3 py-2 rounded-xl text-sm',
            'border-2 border-border bg-background outline-none',
            'focus:border-blue-400 transition-colors',
            'placeholder:text-muted-foreground'
          )}
        />
      </div>

      {/* Комментарий */}
      <Textarea
        placeholder="Оставьте комментарий водителю (по желанию)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        className="resize-none rounded-xl min-h-16 text-sm"
        maxLength={300}
      />

      {/* Итоговая стоимость + кнопки */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Стоимость поездки</span>
          <span className="font-semibold">{formatTripPrice(tripPrice)}</span>
        </div>
        {tip > 0 && (
          <div className="flex items-center justify-between text-sm text-emerald-600">
            <span>Чаевые водителю</span>
            <span className="font-semibold">+{formatTripPrice(tip)}</span>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <Button
          variant="ghost"
          className="flex-1 h-12 rounded-xl text-muted-foreground"
          onClick={onSkip}
          disabled={isSubmitting}
        >
          Пропустить
        </Button>
        <Button
          className="flex-[2] h-12 rounded-xl text-base font-semibold"
          onClick={handleSubmit}
          disabled={!canSubmit || isSubmitting}
        >
          {isSubmitting ? 'Отправляем…' : 'Отправить оценку'}
        </Button>
      </div>
    </div>
  );
}
