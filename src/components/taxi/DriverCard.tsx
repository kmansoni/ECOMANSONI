import { Phone, MessageCircle, Star, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Driver } from '@/types/taxi';
import { formatRating, formatEta, maskPlateNumber } from '@/lib/taxi/formatters';
import { ETAIndicator } from './shared/ETAIndicator';
import { Button } from '@/components/ui/button';

interface DriverCardProps {
  driver: Driver;
  status: 'arriving' | 'arrived' | 'in_trip';
  className?: string;
  onCall?: () => void;
  onChat?: () => void;
}

export function DriverCard({
  driver,
  status,
  className,
  onCall,
  onChat,
}: DriverCardProps) {
  const statusLabel = {
    arriving: 'Водитель едет к вам',
    arrived: 'Водитель на месте',
    in_trip: 'В пути',
  }[status];

  const statusColor = {
    arriving: 'text-blue-600',
    arrived: 'text-emerald-600',
    in_trip: 'text-green-600',
  }[status];

  return (
    <div className={cn('space-y-3', className)}>
      {/* Статус */}
      <div className={cn('flex items-center gap-2', statusColor)}>
        <div className={cn('w-2 h-2 rounded-full animate-pulse', {
          'bg-blue-500': status === 'arriving',
          'bg-emerald-500': status === 'arrived',
          'bg-green-500': status === 'in_trip',
        })} />
        <span className="text-sm font-semibold">{statusLabel}</span>
        {status === 'arriving' && (
          <ETAIndicator minutes={driver.eta} size="sm" className="ml-auto" />
        )}
      </div>

      {/* Разделитель */}
      <div className="border-t border-border" />

      {/* Информация о водителе */}
      <div className="flex items-center gap-3">
        {/* Аватар */}
        <div className="relative flex-shrink-0">
          {driver.photo ? (
            <img
              src={driver.photo}
              alt={driver.name}
              className="w-14 h-14 rounded-2xl object-cover"
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xl font-bold">
              {driver.name.charAt(0)}
            </div>
          )}
          {/* Уровень — проверен */}
          <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-emerald-500 border-2 border-background flex items-center justify-center">
            <Shield className="h-3 w-3 text-white" />
          </div>
        </div>

        {/* Имя, рейтинг, поездки */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-base truncate">{driver.name}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="flex items-center gap-0.5">
              <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
              <span className="text-sm font-medium">{formatRating(driver.rating)}</span>
            </div>
            <span className="text-muted-foreground text-xs">·</span>
            <span className="text-xs text-muted-foreground">{driver.tripsCount.toLocaleString('ru')} поездок</span>
          </div>
          {driver.comment && (
            <p className="text-xs text-muted-foreground mt-0.5 italic truncate">
              «{driver.comment}»
            </p>
          )}
        </div>

        {/* Кнопки звонок/чат */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full border-2"
            onClick={onCall}
            aria-label="Позвонить водителю"
          >
            <Phone className="h-4 w-4 text-emerald-600" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full border-2"
            onClick={onChat}
            aria-label="Написать водителю"
          >
            <MessageCircle className="h-4 w-4 text-blue-600" />
          </Button>
        </div>
      </div>

      {/* Автомобиль */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
        <span className="text-2xl">🚗</span>
        <div className="flex-1">
          <div className="font-medium text-sm">
            {driver.car.make} {driver.car.model}
          </div>
          <div className="text-xs text-muted-foreground">
            {driver.car.color} · {driver.car.year}
          </div>
        </div>
        <div className="text-right">
          <div className="font-semibold text-sm tracking-widest uppercase bg-background border border-border rounded-lg px-2.5 py-1">
            {maskPlateNumber(driver.car.plateNumber)}
          </div>
        </div>
      </div>
    </div>
  );
}
