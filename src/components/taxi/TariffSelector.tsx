import { useRef } from 'react';
import { Zap, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TariffEstimate, VehicleClass } from '@/types/taxi';
import { TARIFF_COLORS } from '@/lib/taxi/constants';
import { formatTripPrice, formatEta, formatSurge } from '@/lib/taxi/formatters';
import { Skeleton } from '@/components/ui/skeleton';

interface TariffSelectorProps {
  estimates: TariffEstimate[];
  selectedTariff: VehicleClass | null;
  onSelect: (tariffId: VehicleClass) => void;
  isLoading?: boolean;
  className?: string;
}

export function TariffSelector({
  estimates,
  selectedTariff,
  onSelect,
  isLoading = false,
  className,
}: TariffSelectorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (isLoading) {
    return (
      <div className={cn('flex gap-3 overflow-x-auto pb-1 px-1 no-scrollbar', className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="flex-shrink-0 w-28 h-24 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className={cn(
        'flex gap-3 overflow-x-auto pb-1 px-1 no-scrollbar',
        'scroll-smooth snap-x snap-mandatory',
        className
      )}
    >
      {estimates.map((estimate) => {
        const isSelected = selectedTariff === estimate.id;
        const surge = estimate.surgeMultiplier > 1.0;
        const color = TARIFF_COLORS[estimate.id] ?? '#6366f1';

        return (
          <button
            key={estimate.id}
            type="button"
            onClick={() => onSelect(estimate.id)}
            disabled={!estimate.available}
            className={cn(
              'relative flex-shrink-0 snap-start',
              'flex flex-col items-center justify-between',
              'w-28 p-3 rounded-2xl',
              'border-2 transition-all duration-200',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              isSelected
                ? 'border-transparent shadow-lg scale-[1.02]'
                : 'border-border bg-card hover:border-gray-300 hover:shadow-sm',
              !estimate.available && 'opacity-40'
            )}
            style={
              isSelected
                ? {
                    background: `linear-gradient(135deg, ${color}15, ${color}25)`,
                    borderColor: color,
                    borderWidth: 2,
                  }
                : undefined
            }
          >
            {/* Surge badge */}
            {surge && (
              <div
                className="absolute -top-2 -right-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-white text-[10px] font-bold shadow"
                style={{ background: '#f97316' }}
              >
                <Zap className="h-2.5 w-2.5" />
                {formatSurge(estimate.surgeMultiplier)}
              </div>
            )}

            {/* Популярный / кастомный бейдж */}
            {estimate.badge && !surge && (
              <div
                className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-white text-[9px] font-bold whitespace-nowrap shadow"
                style={{ background: color }}
              >
                {estimate.badge}
              </div>
            )}

            {/* Эмодзи */}
            <span className="text-3xl leading-none mb-1">{estimate.emoji}</span>

            {/* Название */}
            <span
              className={cn(
                'text-xs font-semibold',
                isSelected ? 'text-foreground' : 'text-muted-foreground'
              )}
              style={isSelected ? { color } : undefined}
            >
              {estimate.name}
            </span>

            {/* Цена */}
            <span className="text-sm font-bold text-foreground mt-0.5">
              {formatTripPrice(estimate.estimatedPrice)}
            </span>

            {/* ETA */}
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[11px] text-muted-foreground">
                {formatEta(estimate.eta)}
              </span>
            </div>

            {/* Вместимость */}
            <div className="flex items-center gap-0.5 mt-0.5">
              <Users className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">{estimate.capacity}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
