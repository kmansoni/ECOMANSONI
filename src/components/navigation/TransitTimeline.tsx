import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { MultiModalRoute, MultiModalSegment, TransitType } from '@/types/navigation';

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

function formatDuration(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} м`;
  return `${(meters / 1000).toFixed(1)} км`;
}

function SegmentItem({
  segment,
  index,
  isLast,
  onSelect,
  isSelected,
}: {
  segment: MultiModalSegment;
  index: number;
  isLast: boolean;
  onSelect?: () => void;
  isSelected?: boolean;
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
            Пешком {formatDuration(segment.durationSeconds)}
          </p>
          <p className="text-xs text-gray-500">{formatDistance(segment.distanceMeters)}</p>
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
            {formatDuration(segment.durationSeconds)}
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
        <p className="text-sm text-gray-300">Такси {formatDuration(segment.durationSeconds)}</p>
        <p className="text-xs text-gray-500">{formatDistance(segment.distanceMeters)}</p>
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
  return (
    <div className={cn('space-y-1', className)}>
      {/* Header summary */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-base font-semibold text-white">
          {formatDuration(route.totalDurationSeconds)}
        </p>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{formatDistance(route.totalDistanceMeters)}</span>
          {route.transfers > 0 && (
            <span className="px-1.5 py-0.5 bg-white/10 rounded">
              {route.transfers} пересад{route.transfers === 1 ? 'ка' : route.transfers < 5 ? 'ки' : 'ок'}
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
          />
        ))}
      </div>

      {/* Eco badge */}
      {route.ecoScore >= 7 && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-green-400">
          <span>🌿</span>
          <span>Экологичный маршрут (оценка {route.ecoScore}/10)</span>
        </div>
      )}
    </div>
  );
});
