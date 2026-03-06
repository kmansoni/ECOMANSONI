import { MapPin, Navigation, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { formatEta, formatDistance } from '@/lib/taxi/formatters';
import { ETAIndicator } from './shared/ETAIndicator';

interface TripTrackerProps {
  pickupAddress: string;
  destinationAddress: string;
  progress: number;      // 0..1
  etaMinutes: number;
  distanceLeft: number;  // км
  className?: string;
}

export function TripTracker({
  pickupAddress,
  destinationAddress,
  progress,
  etaMinutes,
  distanceLeft,
  className,
}: TripTrackerProps) {
  const progressPct = Math.round(Math.min(100, progress * 100));

  return (
    <div className={cn('space-y-3', className)}>
      {/* ETA крупно */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground mb-0.5">Прибудем через</div>
          <ETAIndicator minutes={etaMinutes} size="lg" pulsing />
        </div>
        <div className="text-right">
          <div className="text-sm text-muted-foreground mb-0.5">Осталось</div>
          <span className="text-lg font-bold">{formatDistance(distanceLeft)}</span>
        </div>
      </div>

      {/* Прогресс-бар маршрута */}
      <div className="relative">
        <Progress value={progressPct} className="h-2" />
        {/* Индикатор текущей позиции */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-md transition-all duration-300"
          style={{ left: `calc(${progressPct}% - 8px)` }}
        />
      </div>

      {/* Маршрут A → B */}
      <div className="space-y-2">
        <div className="flex items-start gap-2.5">
          <div className="flex-shrink-0 mt-0.5">
            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
              <span className="text-[9px] text-white font-bold">A</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground">Откуда</div>
            <div className="text-sm font-medium truncate">{pickupAddress}</div>
          </div>
        </div>

        {/* Линия соединения */}
        <div className="ml-2.5 pl-[0.4rem] border-l-2 border-dashed border-border h-4" />

        <div className="flex items-start gap-2.5">
          <div className="flex-shrink-0 mt-0.5">
            <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
              <span className="text-[9px] text-white font-bold">B</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground">Куда</div>
            <div className="text-sm font-medium truncate">{destinationAddress}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
