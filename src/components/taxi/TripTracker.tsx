import { cn } from '@/lib/utils';
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

  // Расчёт приблизительной скорости
  const estimatedSpeed = distanceLeft > 0 && etaMinutes > 0
    ? Math.round((distanceLeft / etaMinutes) * 60)
    : 0;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Верхняя панель — скорость + ETA + расстояние */}
      <div className="flex items-center justify-between">
        {/* Скорость (Яндекс-стиль) */}
        <div className="flex items-center gap-2">
          <div className="w-12 h-12 rounded-xl bg-emerald-400/15 border border-emerald-400/20 flex flex-col items-center justify-center">
            <span className="text-lg font-bold text-emerald-400 leading-none">{estimatedSpeed}</span>
            <span className="text-[9px] text-emerald-400/70 leading-none">км/ч</span>
          </div>
        </div>

        {/* ETA */}
        <div className="text-center">
          <div className="text-xs text-white/40 mb-0.5">Прибудем через</div>
          <ETAIndicator minutes={etaMinutes} size="lg" pulsing />
        </div>

        {/* Расстояние */}
        <div className="text-right">
          <div className="text-xs text-white/40 mb-0.5">Осталось</div>
          <span className="text-lg font-bold text-white">{formatDistance(distanceLeft)}</span>
        </div>
      </div>

      {/* Прогресс-бар маршрута — Яндекс-стиль жёлтый */}
      <div className="relative">
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-300 transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {/* Индикатор текущей позиции */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-amber-400 border-2 border-gray-950 shadow-md shadow-amber-400/30 transition-all duration-300"
          style={{ left: `calc(${progressPct}% - 8px)` }}
        />
      </div>

      {/* Маршрут A → B */}
      <div className="space-y-1.5">
        <div className="flex items-start gap-2.5">
          <div className="flex-shrink-0 mt-0.5">
            <div className="w-5 h-5 rounded-full bg-emerald-400/20 flex items-center justify-center">
              <span className="text-[9px] text-emerald-400 font-bold">A</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-white/30 uppercase tracking-wider">Откуда</div>
            <div className="text-sm font-medium text-white/60 truncate">{pickupAddress}</div>
          </div>
        </div>

        {/* Линия */}
        <div className="ml-2.5 pl-[0.4rem] border-l-2 border-dashed border-white/10 h-3" />

        <div className="flex items-start gap-2.5">
          <div className="flex-shrink-0 mt-0.5">
            <div className="w-5 h-5 rounded-full bg-rose-400/20 flex items-center justify-center">
              <span className="text-[9px] text-rose-400 font-bold">B</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-white/30 uppercase tracking-wider">Куда</div>
            <div className="text-sm font-medium text-white truncate">{destinationAddress}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
