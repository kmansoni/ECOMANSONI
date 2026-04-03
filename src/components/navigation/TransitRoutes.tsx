/**
 * TransitRoutes — компонент отображения маршрутов общественного транспорта.
 *
 * Показывает автобусы, троллейбусы, трамваи, метро, электрички
 * с иконками, цветами линий и остановками.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Bus,
  Train,
  Zap,
  Search,
  MapPin,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  useTransitRoutes,
  type TransitRoute,
  type TransitType,
  type TransitStop,
} from '@/hooks/useTransitRoutes';

// ─── Конфигурация типов транспорта ───────────────────────────────────────────

interface TransitTypeConfig {
  label: string;
  icon: React.ReactNode;
  badgeColor: string;
}

const TRANSIT_TYPE_CONFIG: Record<TransitType, TransitTypeConfig> = {
  bus: {
    label: 'Автобус',
    icon: <Bus className="w-4 h-4" />,
    badgeColor: 'bg-blue-500/20 text-blue-400',
  },
  trolleybus: {
    label: 'Троллейбус',
    icon: <Zap className="w-4 h-4" />,
    badgeColor: 'bg-emerald-500/20 text-emerald-400',
  },
  tram: {
    label: 'Трамвай',
    icon: <Train className="w-4 h-4" />,
    badgeColor: 'bg-red-500/20 text-red-400',
  },
  metro: {
    label: 'Метро',
    icon: <span className="text-sm font-bold">M</span>,
    badgeColor: 'bg-rose-500/20 text-rose-400',
  },
  suburban: {
    label: 'Электричка',
    icon: <Train className="w-4 h-4" />,
    badgeColor: 'bg-purple-500/20 text-purple-400',
  },
};

const FILTER_TYPES: { value: TransitType | 'all'; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'bus', label: 'Автобусы' },
  { value: 'trolleybus', label: 'Троллейбусы' },
  { value: 'tram', label: 'Трамваи' },
  { value: 'metro', label: 'Метро' },
  { value: 'suburban', label: 'Электрички' },
];

// ─── Карточка остановки ──────────────────────────────────────────────────────

function StopCard({ stop, isLast, color }: { stop: TransitStop; isLast: boolean; color: string }) {
  return (
    <div className="flex items-start gap-3 relative">
      {/* Линия маршрута */}
      <div className="flex flex-col items-center flex-shrink-0 w-5">
        <div
          className="w-3 h-3 rounded-full border-2 flex-shrink-0"
          style={{ borderColor: color, backgroundColor: `${color}33` }}
        />
        {!isLast && (
          <div
            className="w-0.5 flex-1 min-h-[20px]"
            style={{ backgroundColor: `${color}66` }}
          />
        )}
      </div>

      {/* Информация об остановке */}
      <div className="pb-3 min-w-0">
        <p className="text-sm text-white/80 truncate">{stop.name}</p>
      </div>
    </div>
  );
}

// ─── Карточка маршрута ───────────────────────────────────────────────────────

function RouteCard({
  route,
  onSelectRoute,
}: {
  route: TransitRoute;
  onSelectRoute?: (route: TransitRoute) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const config = TRANSIT_TYPE_CONFIG[route.route_type];
  const sortedStops = useMemo(
    () => [...route.stops].sort((a, b) => a.order - b.order),
    [route.stops]
  );

  const handleToggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <div
      className={cn(
        'bg-zinc-900/80 rounded-xl border border-zinc-800',
        'transition-all duration-200',
        'hover:border-zinc-700'
      )}
    >
      {/* Заголовок маршрута */}
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3 text-left',
          'min-h-[44px] transition-colors'
        )}
        aria-expanded={expanded}
        aria-label={`Маршрут ${route.route_number} — ${route.name}`}
      >
        {/* Номер маршрута */}
        <div
          className="min-w-[40px] h-8 rounded-lg flex items-center justify-center px-2"
          style={{ backgroundColor: `${route.color}30` }}
        >
          <span className="text-sm font-bold" style={{ color: route.color }}>
            {route.route_number}
          </span>
        </div>

        {/* Иконка типа */}
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', config.badgeColor)}>
          {config.icon}
        </div>

        {/* Название */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{route.name}</p>
          <p className="text-xs text-zinc-500">
            {config.label} · {route.stops.length} остановок
          </p>
        </div>

        {/* Стрелки */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {onSelectRoute && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectRoute(route);
              }}
              className={cn(
                'p-1.5 rounded-lg transition-colors min-w-[32px] min-h-[32px]',
                'flex items-center justify-center',
                'text-zinc-500 hover:text-white hover:bg-white/10'
              )}
              aria-label={`Показать на карте маршрут ${route.route_number}`}
            >
              <MapPin className="w-4 h-4" />
            </button>
          )}
          <ChevronDown
            className={cn(
              'w-4 h-4 text-zinc-500 transition-transform duration-200',
              expanded && 'rotate-180'
            )}
          />
        </div>
      </button>

      {/* Остановки (раскрываемый блок) */}
      {expanded && sortedStops.length > 0 && (
        <div className="px-4 pb-3 pt-1 border-t border-zinc-800/60">
          <p className="text-xs text-zinc-500 mb-2">Остановки маршрута</p>
          <div className="max-h-[200px] overflow-y-auto">
            {sortedStops.map((stop, i) => (
              <StopCard
                key={stop.id}
                stop={stop}
                isLast={i === sortedStops.length - 1}
                color={route.color}
              />
            ))}
          </div>
        </div>
      )}

      {expanded && sortedStops.length === 0 && (
        <div className="px-4 pb-3 border-t border-zinc-800/60">
          <p className="text-xs text-zinc-500 py-2 text-center">Нет данных об остановках</p>
        </div>
      )}
    </div>
  );
}

// ─── Основной компонент ──────────────────────────────────────────────────────

interface TransitRoutesProps {
  onSelectRoute?: (route: TransitRoute) => void;
  className?: string;
}

export function TransitRoutes({ onSelectRoute, className }: TransitRoutesProps) {
  const { routes, loading, error, searchRoutes, refresh } = useTransitRoutes();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TransitRoute[] | null>(null);
  const [filter, setFilter] = useState<TransitType | 'all'>('all');
  const [searching, setSearching] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Поиск с debounce ──────────────────────────────────────────────────

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!searchQuery.trim()) {
      setSearchResults(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const results = await searchRoutes(searchQuery);
      setSearchResults(results);
      setSearching(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, searchRoutes]);

  // ─── Фильтрация ───────────────────────────────────────────────────────

  const displayRoutes = useMemo(() => {
    const source = searchResults ?? routes;
    if (filter === 'all') return source;
    return source.filter((r) => r.route_type === filter);
  }, [routes, searchResults, filter]);

  // ─── Loading ──────────────────────────────────────────────────────────

  if (loading && routes.length === 0) {
    return (
      <div className={cn('space-y-3', className)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-16 bg-zinc-900/50 rounded-xl animate-pulse"
          />
        ))}
      </div>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────

  if (error && routes.length === 0) {
    return (
      <div className={cn('flex flex-col items-center gap-3 py-10', className)}>
        <p className="text-sm text-red-400">{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
        >
          <RefreshCw className="w-4 h-4 mr-1.5" />
          Повторить
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Поиск */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Номер маршрута..."
          className={cn(
            'w-full pl-10 pr-4 py-2.5 rounded-xl text-sm',
            'bg-zinc-900 border border-zinc-800 text-white',
            'placeholder:text-zinc-600 outline-none',
            'focus:border-blue-500/50 transition-colors'
          )}
          aria-label="Поиск по номеру маршрута"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 animate-spin" />
        )}
      </div>

      {/* Фильтр по типу */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {FILTER_TYPES.map((ft) => (
          <button
            key={ft.value}
            type="button"
            onClick={() => setFilter(ft.value)}
            className={cn(
              'whitespace-nowrap text-xs px-3 py-1.5 rounded-full border',
              'transition-colors shrink-0 min-h-[32px]',
              filter === ft.value
                ? 'bg-blue-500/20 border-blue-500/50 text-blue-400 font-medium'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600'
            )}
            aria-pressed={filter === ft.value}
          >
            {ft.label}
          </button>
        ))}
      </div>

      {/* Результат поиска — empty */}
      {displayRoutes.length === 0 && !loading && (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Bus className="w-10 h-10 text-zinc-700" />
          <p className="text-sm text-zinc-500">
            {searchQuery.trim()
              ? `Маршруты по запросу «${searchQuery}» не найдены`
              : 'Нет доступных маршрутов'}
          </p>
        </div>
      )}

      {/* Список маршрутов */}
      <div className="space-y-2">
        {displayRoutes.map((route) => (
          <RouteCard
            key={route.id}
            route={route}
            onSelectRoute={onSelectRoute}
          />
        ))}
      </div>
    </div>
  );
}
