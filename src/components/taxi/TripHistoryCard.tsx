import { Star, MapPin, ArrowRight, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TripHistoryItem } from '@/types/taxi';
import {
  formatTripPrice,
  formatTripDate,
  formatEta,
  formatDistance,
  formatVehicleClass,
} from '@/lib/taxi/formatters';
import { TARIFF_COLORS } from '@/lib/taxi/constants';

interface TripHistoryCardProps {
  trip: TripHistoryItem;
  onClick?: (trip: TripHistoryItem) => void;
  className?: string;
}

export function TripHistoryCard({ trip, onClick, className }: TripHistoryCardProps) {
  const isCompleted = trip.status === 'completed';
  const tariffColor = TARIFF_COLORS[trip.tariff] ?? '#6366f1';

  return (
    <button
      type="button"
      onClick={() => onClick?.(trip)}
      className={cn(
        'w-full text-left',
        'bg-card border border-border rounded-2xl',
        'p-4 space-y-3',
        'hover:shadow-md transition-all duration-200',
        'active:scale-[0.99]',
        className
      )}
    >
      {/* Верхняя строка: дата + статус */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{formatTripDate(trip.date)}</span>
        <div className="flex items-center gap-2">
          {/* Тариф */}
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
            style={{ background: tariffColor }}
          >
            {trip.tariffName}
          </span>
          {/* Статус */}
          <span
            className={cn(
              'text-xs font-medium px-2 py-0.5 rounded-full',
              isCompleted
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-red-50 text-red-700'
            )}
          >
            {isCompleted ? 'Завершена' : 'Отменена'}
          </span>
        </div>
      </div>

      {/* Маршрут */}
      <div className="flex items-center gap-2">
        {/* Точки маршрута */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <div className="w-0.5 h-4 bg-gray-200" />
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
        </div>

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="text-sm font-medium truncate">
            {trip.pickup.shortAddress ?? trip.pickup.address}
          </div>
          <div className="text-sm text-muted-foreground truncate">
            {trip.destination.shortAddress ?? trip.destination.address}
          </div>
        </div>

        {/* Стрелка */}
        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      </div>

      {/* Нижняя строка: цена, расстояние, время, рейтинг */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Цена */}
          <span className="font-bold text-base">
            {isCompleted ? formatTripPrice(trip.price) : '-'}
          </span>
          {/* Разделитель */}
          {isCompleted && (
            <>
              <span className="text-muted-foreground text-xs">·</span>
              <span className="text-xs text-muted-foreground">
                {formatDistance(trip.distance)}
              </span>
              <span className="text-muted-foreground text-xs">·</span>
              <span className="text-xs text-muted-foreground">
                {formatEta(trip.duration)}
              </span>
            </>
          )}
        </div>

        {/* Рейтинг пользователя */}
        {trip.userRating && isCompleted && (
          <div className="flex items-center gap-0.5">
            <Star className="h-3.5 w-3.5 fill-amber-400 stroke-amber-400" />
            <span className="text-sm font-medium">{trip.userRating}</span>
          </div>
        )}
      </div>

      {/* Водитель и авто */}
      {trip.driver.name && (
        <div className="flex items-center gap-2 pt-0.5 border-t border-border">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
            {trip.driver.name.charAt(0)}
          </div>
          <span className="text-xs text-muted-foreground truncate">{trip.driver.name}</span>
          <span className="text-muted-foreground text-xs">·</span>
          <span className="text-xs text-muted-foreground">
            {trip.vehicle.make} {trip.vehicle.model}
          </span>
        </div>
      )}
    </button>
  );
}
