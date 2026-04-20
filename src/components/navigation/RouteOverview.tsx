import { Clock, Route, Zap, ChevronRight, Camera, Footprints, Train, CarTaxiFront, Map } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MultiModalRoute, NavRoute, TravelMode } from '@/types/navigation';
import { formatDistance, formatDuration, formatETA } from '@/lib/navigation/turnInstructions';
import { getCamerasOnRoute } from '@/lib/navigation/speedCameras';

interface RouteOverviewProps {
  route: NavRoute;
  alternatives: NavRoute[];
  travelMode: TravelMode;
  multimodalRoute?: MultiModalRoute | null;
  loading: boolean;
  onSelectRoute: (id: string) => void;
  onPrimaryAction: () => void;
  primaryActionLabel?: string;
  onCancel: () => void;
}

function getModeMeta(travelMode: TravelMode): { label: string; description: string; icon: typeof Map } {
  switch (travelMode) {
    case 'taxi':
      return { label: 'Такси', description: 'Быстрый выезд с переходом к заказу машины', icon: CarTaxiFront };
    case 'pedestrian':
      return { label: 'Пешком', description: 'Пеший маршрут без пересадок и дорожного трафика', icon: Footprints };
    case 'transit':
      return { label: 'Общественный транспорт', description: 'Маршрут с линиями ОТ, остановками и пересадками', icon: Train };
    case 'metro':
      return { label: 'Метро', description: 'Маршрут с акцентом на подземку и быстрые пересадки', icon: Train };
    case 'multimodal':
      return { label: 'Мультимодальный', description: 'Комбинация пеших участков, ОТ и доступных пересадок', icon: Map };
    case 'car':
    default:
      return { label: 'Авто', description: 'Классический автомобильный маршрут с учётом дорожной ситуации', icon: Map };
  }
}

function getDefaultActionLabel(travelMode: TravelMode): string {
  switch (travelMode) {
    case 'taxi':
      return 'К заказу такси';
    case 'pedestrian':
      return 'Начать пеший маршрут';
    case 'transit':
    case 'metro':
    case 'multimodal':
      return 'Начать сопровождение';
    case 'car':
    default:
      return 'Поехали';
  }
}

function RouteCard({
  route,
  isMain,
  onSelect,
}: {
  route: NavRoute;
  isMain: boolean;
  onSelect: () => void;
}) {
  const cameras = getCamerasOnRoute(route.geometry);

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full p-3 rounded-xl border transition-all text-left',
        isMain
          ? 'bg-gray-800/80 border-blue-500/50 shadow-lg shadow-blue-500/10'
          : 'bg-gray-800/40 border-white/5 hover:border-white/15'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-lg font-bold tabular-nums',
            isMain ? 'text-blue-400' : 'text-gray-400'
          )}>
            {formatDuration(route.totalDurationSeconds)}
          </span>
          {isMain && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-medium">
              Лучший
            </span>
          )}
        </div>
        <span className="text-sm text-gray-400 tabular-nums">
          {formatDistance(route.totalDistanceMeters)}
        </span>
      </div>

      <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>Прибытие: {formatETA(route.totalDurationSeconds)}</span>
        </div>
        {cameras.length > 0 && (
          <div className="flex items-center gap-1 text-red-400">
            <Camera className="w-3 h-3" />
            <span>{cameras.length} камер</span>
          </div>
        )}
      </div>
    </button>
  );
}

export function RouteOverview({
  route,
  alternatives,
  travelMode,
  multimodalRoute = null,
  loading,
  onSelectRoute,
  onPrimaryAction,
  primaryActionLabel,
  onCancel,
}: RouteOverviewProps) {
  const modeMeta = getModeMeta(travelMode);
  const ModeIcon = modeMeta.icon;
  const actionLabel = primaryActionLabel ?? getDefaultActionLabel(travelMode);
  const transitSegments = multimodalRoute?.segments.filter((segment) => segment.mode === 'transit') ?? [];

  return (
    <div className={cn(
      'absolute bottom-0 left-0 right-0 z-[900]',
      'bg-gray-950/95 backdrop-blur-xl',
      'rounded-t-2xl border-t border-white/10',
      'shadow-[0_-8px_40px_rgba(0,0,0,0.5)]',
      'pb-safe'
    )}>
      {/* Drag handle */}
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 rounded-full bg-white/20" />
      </div>

      <div className="px-4 pb-4">
        {/* Route summary header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                <ModeIcon className="w-4 h-4 text-blue-300" />
              </div>
              <div>
                <h3 className="text-white font-semibold">{modeMeta.label}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{modeMeta.description}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-sm text-gray-400">
            <Route className="w-4 h-4" />
            <span>{alternatives.length + 1} вариант{alternatives.length > 0 ? 'а' : ''}</span>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-gray-200">
            {formatDuration(route.totalDurationSeconds)}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-gray-200">
            {formatDistance(route.totalDistanceMeters)}
          </span>
          {multimodalRoute?.fare != null && (
            <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-emerald-300">
              {multimodalRoute.fare} ₽
            </span>
          )}
          {multimodalRoute && multimodalRoute.transfers > 0 && (
            <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2.5 py-1 text-cyan-200">
              {multimodalRoute.transfers} пересад.
            </span>
          )}
          {transitSegments.length > 0 && (
            <span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-500/10 px-2.5 py-1 text-fuchsia-200">
              {transitSegments.length} линий ОТ
            </span>
          )}
          {multimodalRoute && (
            <span className="rounded-full border border-lime-400/20 bg-lime-500/10 px-2.5 py-1 text-lime-200">
              Эко {multimodalRoute.ecoScore}/10
            </span>
          )}
        </div>

        {/* Main route */}
        <RouteCard route={route} isMain onSelect={() => {}} />

        {/* Alternatives */}
        {alternatives.length > 0 && (
          <div className="mt-2 space-y-2">
            {alternatives.map((alt) => (
              <RouteCard
                key={alt.id}
                route={alt}
                isMain={false}
                onSelect={() => onSelectRoute(alt.id)}
              />
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={onCancel}
            className={cn(
              'flex-1 h-12 rounded-xl',
              'bg-gray-800 border border-white/10',
              'text-gray-300 font-medium text-sm',
              'transition-all active:scale-[0.98] hover:bg-gray-700'
            )}
          >
            Отмена
          </button>
          <button
            onClick={onPrimaryAction}
            disabled={loading}
            className={cn(
              'flex-[2] h-12 rounded-xl',
              'bg-green-500 hover:bg-green-600',
              'text-white font-bold text-sm',
              'transition-all active:scale-[0.98]',
              'shadow-lg shadow-green-500/30',
              'flex items-center justify-center gap-2',
              loading && 'opacity-50'
            )}
          >
            <Zap className="w-5 h-5" />
            {actionLabel}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
