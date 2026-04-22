import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { MultiModalRoute, MultiModalSegment, TransitType } from '@/types/navigation';
import { useUserSettings } from '@/contexts/UserSettingsContext';
import { formatNavigationDistance, formatNavigationDuration, formatTransfers, navText } from '@/lib/navigation/navigationUi';

interface TransitTimelineProps {
  route: MultiModalRoute;
  onSelectSegment?: (index: number) => void;
  selectedSegmentIndex?: number | null;
  className?: string;
}

const TRANSIT_ICONS: Record<TransitType, string> = {
  bus: '🚌',
  trolleybus: '🚎',
  tram: '🚊',
  metro: '🚇',
  suburban: '🚆',
  ferry: '⛴️',
  cable_car: '🚡',
};

function SegmentItem({
  segment,
  index,
  isLast,
  onSelect,
  isSelected,
  languageCode,
}: {
  segment: MultiModalSegment;
  index: number;
  isLast: boolean;
  onSelect?: () => void;
  isSelected?: boolean;
  languageCode?: string | null;
}) {
  if (segment.mode === 'walk') {
    const content = (
      <div className="flex items-start gap-3 w-full text-left">
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-sm">
            🚶
          </div>
          {!isLast && <div className="w-0.5 h-6 bg-white/10 mt-1" />}
        </div>
        <div className="flex-1 pt-1">
          <p className="text-sm text-gray-300">
            {navText('Пешком', 'Walk', languageCode)} {formatNavigationDuration(segment.durationSeconds, languageCode)}
          </p>
          <p className="text-xs text-gray-500">{formatNavigationDistance(segment.distanceMeters, languageCode)}</p>
        </div>
      </div>
    );

    if (!onSelect) return content;

    return (
      <button
        onClick={onSelect}
        className={cn(
          'w-full rounded-lg p-1 -m-1 transition-colors',
          isSelected ? 'bg-green-500/10 ring-1 ring-green-400/30' : 'hover:bg-white/5'
        )}
      >
        {content}
      </button>
    );
  }

  if (segment.mode === 'transit' && segment.trip) {
    const icon = TRANSIT_ICONS[segment.trip.routeType] ?? '🚌';
    const color = segment.trip.routeColor ?? '#3B82F6';

    return (
      <button
        onClick={onSelect}
        className={cn(
          'flex items-start gap-3 w-full text-left rounded-lg transition-colors p-1 -m-1',
          isSelected ? 'bg-cyan-500/10 ring-1 ring-cyan-400/30' : 'hover:bg-white/5'
        )}
      >
        <div className="flex flex-col items-center">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
            style={{ backgroundColor: `${color}30` }}
          >
            {icon}
          </div>
          {!isLast && (
            <div className="w-0.5 h-8 mt-1" style={{ backgroundColor: color }} />
          )}
        </div>
        <div className="flex-1 pt-0.5">
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-bold px-2 py-0.5 rounded"
              style={{ backgroundColor: color, color: '#fff' }}
            >
              {segment.trip.routeName}
            </span>
            <span className="text-xs text-gray-400">{segment.trip.headsign}</span>
          </div>
          <p className="text-sm text-gray-300 mt-0.5">
            {formatNavigationDuration(segment.durationSeconds, languageCode)}
            {segment.fromStop && segment.toStop && (
              <span className="text-gray-500">
                {' '}· {segment.fromStop.name} → {segment.toStop.name}
              </span>
            )}
          </p>
        </div>
      </button>
    );
  }

  // Car segment
  const content = (
    <div className="flex items-start gap-3 w-full text-left">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-sm">
          🚗
        </div>
        {!isLast && <div className="w-0.5 h-6 bg-white/10 mt-1" />}
      </div>
      <div className="flex-1 pt-1">
        <p className="text-sm text-gray-300">{navText('Такси', 'Taxi', languageCode)} {formatNavigationDuration(segment.durationSeconds, languageCode)}</p>
        <p className="text-xs text-gray-500">{formatNavigationDistance(segment.distanceMeters, languageCode)}</p>
      </div>
    </div>
  );

  if (!onSelect) return content;

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full rounded-lg p-1 -m-1 transition-colors',
        isSelected ? 'bg-amber-500/10 ring-1 ring-amber-400/30' : 'hover:bg-white/5'
      )}
    >
      {content}
    </button>
  );
}

export const TransitTimeline = memo(function TransitTimeline({
  route,
  onSelectSegment,
  selectedSegmentIndex = null,
  className,
}: TransitTimelineProps) {
  const { settings } = useUserSettings();
  const languageCode = settings?.language_code ?? null;
  return (
    <div className={cn('space-y-1', className)}>
      {/* Header summary */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-base font-semibold text-white">
          {formatNavigationDuration(route.totalDurationSeconds, languageCode)}
        </p>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{formatNavigationDistance(route.totalDistanceMeters, languageCode)}</span>
          {route.transfers > 0 && (
            <span className="px-1.5 py-0.5 bg-white/10 rounded">
              {formatTransfers(route.transfers, languageCode)}
            </span>
          )}
          {route.fare != null && (
            <span>{route.fare} ₽</span>
          )}
        </div>
      </div>

      {/* Route description */}
      <p className="text-xs text-gray-500 mb-2">{route.description}</p>

      {/* Segments timeline */}
      <div className="space-y-2">
        {route.segments.map((seg, i) => (
          <SegmentItem
            key={i}
            segment={seg}
            index={i}
            isLast={i === route.segments.length - 1}
            onSelect={onSelectSegment ? () => onSelectSegment(i) : undefined}
            isSelected={selectedSegmentIndex === i}
            languageCode={languageCode}
          />
        ))}
      </div>

      {/* Eco badge */}
      {route.ecoScore >= 7 && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-green-400">
          <span>🌿</span>
          <span>{navText('Экологичный маршрут', 'Eco-friendly route', languageCode)} ({navText('оценка', 'score', languageCode)} {route.ecoScore}/10)</span>
        </div>
      )}
    </div>
  );
});
