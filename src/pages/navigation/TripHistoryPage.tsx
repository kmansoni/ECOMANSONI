/**
 * TripHistoryPage — displays all recorded navigation trips with details.
 */
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Navigation2, Clock, Gauge, Route,
  Trash2, ChevronRight, Car, Calendar, TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTripHistory, deleteTrip, type TripRecord } from '@/lib/navigation/tripHistory';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} сек`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} ч ${m} мин`;
  return `${m} мин`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} м`;
  return `${(meters / 1000).toFixed(1)} км`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tripDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (today.getTime() - tripDay.getTime()) / 86400000;

  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  if (diff === 0) return `Сегодня, ${time}`;
  if (diff === 1) return `Вчера, ${time}`;
  if (diff < 7) {
    const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    return `${days[d.getDay()]}, ${time}`;
  }
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'short', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  }) + `, ${time}`;
}

function TrafficBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const color = score <= 3 ? 'bg-green-500/20 text-green-400' :
    score <= 6 ? 'bg-yellow-500/20 text-yellow-400' :
      'bg-red-500/20 text-red-400';
  return (
    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', color)}>
      {score}/10
    </span>
  );
}

function TripCard({
  trip,
  onDelete,
  onRepeat,
}: {
  trip: TripRecord;
  onDelete: (id: string) => void;
  onRepeat: (trip: TripRecord) => void;
}) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className={cn(
        'bg-gray-900/60 backdrop-blur-sm rounded-xl border border-white/5',
        'p-3 transition-all hover:bg-gray-800/60',
      )}
      onClick={() => setShowActions(!showActions)}
    >
      {/* Header: date + status */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Calendar className="w-3 h-3" />
          <span>{formatDate(trip.startedAt)}</span>
          {trip.endedAt && (
            <span className="text-gray-600">
              → {new Date(trip.endedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <TrafficBadge score={trip.trafficScore} />
      </div>

      {/* Route */}
      <div className="flex gap-3 mb-2">
        <div className="flex flex-col items-center gap-0.5 pt-1">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-blue-500/30" />
          <div className="w-px h-5 bg-gray-600" />
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-red-500/30" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{trip.originName}</p>
          {trip.originAddress && (
            <p className="text-gray-500 text-[11px] truncate">{trip.originAddress}</p>
          )}
          <div className="h-1" />
          <p className="text-white text-sm font-medium truncate">{trip.destinationName}</p>
          {trip.destinationAddress && (
            <p className="text-gray-500 text-[11px] truncate">{trip.destinationAddress}</p>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-gray-600 self-center flex-shrink-0" />
      </div>

      {/* Metrics */}
      <div className="flex items-center gap-3 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <Route className="w-3 h-3" />
          {formatDistance(trip.distanceMeters)}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatDuration(trip.durationSeconds)}
        </span>
        <span className="flex items-center gap-1">
          <Gauge className="w-3 h-3" />
          {trip.avgSpeedKmh} км/ч
        </span>
        {trip.maxSpeedKmh > 0 && (
          <span className="flex items-center gap-1 text-gray-500">
            <TrendingUp className="w-3 h-3" />
            макс {trip.maxSpeedKmh}
          </span>
        )}
      </div>

      {/* Actions (shown on tap) */}
      {showActions && (
        <div className="flex gap-2 mt-3 pt-2 border-t border-white/5">
          <button
            onClick={(e) => { e.stopPropagation(); onRepeat(trip); }}
            className={cn(
              'flex-1 h-9 rounded-lg text-xs font-medium',
              'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30',
              'flex items-center justify-center gap-1.5 transition-colors',
            )}
          >
            <Navigation2 className="w-3.5 h-3.5" />
            Повторить
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(trip.id); }}
            className={cn(
              'h-9 px-4 rounded-lg text-xs font-medium',
              'bg-red-500/10 text-red-400 hover:bg-red-500/20',
              'flex items-center justify-center gap-1.5 transition-colors',
            )}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Stats Summary ────────────────────────────────────────────────────────────

function StatsSummary({ trips }: { trips: TripRecord[] }) {
  const totalKm = trips.reduce((s, t) => s + t.distanceMeters, 0) / 1000;
  const totalTime = trips.reduce((s, t) => s + t.durationSeconds, 0);
  const totalTrips = trips.length;
  const avgSpeed = totalTime > 0
    ? Math.round(totalKm / (totalTime / 3600))
    : 0;

  return (
    <div className="grid grid-cols-4 gap-2 mb-4">
      {[
        { label: 'Поездок', value: totalTrips, icon: Car },
        { label: 'Км', value: Math.round(totalKm), icon: Route },
        { label: 'Часов', value: Math.round(totalTime / 3600), icon: Clock },
        { label: 'Ср. скорость', value: `${avgSpeed}`, icon: Gauge },
      ].map(({ label, value, icon: Icon }) => (
        <div
          key={label}
          className={cn(
            'bg-gray-900/40 rounded-xl p-2.5 text-center',
            'border border-white/5',
          )}
        >
          <Icon className="w-4 h-4 text-blue-400 mx-auto mb-1" />
          <div className="text-white text-base font-bold leading-none">{value}</div>
          <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function TripHistoryPage() {
  const routerNav = useNavigate();
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTripHistory(100).then(data => {
      setTrips(data);
      setLoading(false);
    });
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await deleteTrip(id);
    setTrips(prev => prev.filter(t => t.id !== id));
  }, []);

  const handleRepeat = useCallback((trip: TripRecord) => {
    // Navigate to navigation page with destination pre-set
    routerNav('/navigation', {
      state: {
        destination: {
          lat: trip.destinationLat,
          lng: trip.destinationLon,
          name: trip.destinationName,
          address: trip.destinationAddress,
        },
      },
    });
  }, [routerNav]);

  // Group trips by date
  const grouped = trips.reduce<Record<string, TripRecord[]>>((acc, trip) => {
    const d = new Date(trip.startedAt);
    const key = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    (acc[key] ||= []).push(trip);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-gray-950/95 backdrop-blur-lg border-b border-white/5">
        <div className="flex items-center gap-3 px-4 py-3 pt-safe">
          <button onClick={() => routerNav(-1)} className="p-2 -ml-2 hover:bg-white/5 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">История поездок</h1>
          <span className="text-xs text-gray-500 ml-auto">{trips.length} поездок</span>
        </div>
      </div>

      <div className="px-4 py-4">
        {/* Stats */}
        {trips.length > 0 && <StatsSummary trips={trips} />}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && trips.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <MapPin className="w-12 h-12 text-gray-700 mb-4" />
            <h2 className="text-lg font-semibold text-gray-300 mb-1">Нет поездок</h2>
            <p className="text-sm text-gray-500 max-w-xs">
              Начните навигацию, и ваши поездки будут сохраняться автоматически с точной датой и временем.
            </p>
            <button
              onClick={() => routerNav('/navigation')}
              className={cn(
                'mt-6 px-6 h-11 rounded-xl font-medium text-sm',
                'bg-blue-500 hover:bg-blue-600 text-white',
                'transition-colors shadow-lg shadow-blue-500/20',
              )}
            >
              Начать навигацию
            </button>
          </div>
        )}

        {/* Trip list by date */}
        {Object.entries(grouped).map(([date, dateTrips]) => (
          <div key={date} className="mb-4">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 px-1">
              {date}
            </h3>
            <div className="flex flex-col gap-2">
              {dateTrips.map(trip => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  onDelete={handleDelete}
                  onRepeat={handleRepeat}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
