/**
 * TrafficWidget — Виджет баллов пробок (как в Яндекс.Навигаторе).
 *
 * Показывает текущий уровень загрузки дорог вокруг пользователя:
 * - Цветной кружок с баллом (1-10)
 * - По нажатию — детальная информация
 * - Обновляется каждые 2 минуты
 */
import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Activity } from 'lucide-react';
import type { LatLng } from '@/types/taxi';
import {
  fetchTrafficAround,
  calculateTrafficOverview,
  type TrafficOverview,
} from '@/lib/navigation/trafficProvider';
import { useUserSettings } from '@/contexts/UserSettingsContext';
import { navText } from '@/lib/navigation/navigationUi';

interface TrafficWidgetProps {
  position: LatLng | null;
  className?: string;
}

export function TrafficWidget({ position, className }: TrafficWidgetProps) {
  const { settings } = useUserSettings();
  const languageCode = settings?.language_code ?? null;
  const [overview, setOverview] = useState<TrafficOverview>({
    score: 0,
    label: navText('Загрузка...', 'Loading...', languageCode),
    color: '#42A5F5',
    segmentCount: 0,
  });
  const [expanded, setExpanded] = useState(false);

  const refresh = useCallback(async () => {
    if (!position) return;
    const segments = await fetchTrafficAround(position, 5);
    const ov = calculateTrafficOverview(segments);
    setOverview(ov);
  }, [position]);

  // Первая загрузка + обновление каждые 2 минуты
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 120_000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (!position) return null;

  return (
    <div className={cn('relative', className)}>
      {/* Основной кружок */}
      <button
        onClick={() => setExpanded(v => !v)}
        className={cn(
          'w-11 h-11 rounded-xl',
          'bg-gray-900/80 backdrop-blur-md border border-white/10',
          'flex items-center justify-center',
          'transition-all active:scale-95 hover:bg-gray-800/90',
          'shadow-lg shadow-black/30',
          'relative overflow-hidden',
        )}
        aria-label={`${navText('Пробки', 'Traffic', languageCode)}: ${overview.score}`}
      >
        {overview.score > 0 ? (
          <span
            className="text-sm font-bold"
            style={{ color: overview.color }}
          >
            {overview.score}
          </span>
        ) : (
          <Activity className="w-5 h-5 text-gray-400" />
        )}

        {/* Индикаторная полоска снизу */}
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5"
          style={{ backgroundColor: overview.color }}
        />
      </button>

      {/* Раскрытая панель */}
      {expanded && (
        <div
          className={cn(
            'absolute top-full mt-2 right-0',
            'bg-gray-900/95 backdrop-blur-xl',
            'rounded-xl border border-white/10',
            'shadow-lg shadow-black/40',
            'px-4 py-3 min-w-[180px]',
            'animate-in fade-in slide-in-from-top-2 duration-200',
          )}
        >
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg"
              style={{
                backgroundColor: `${overview.color}20`,
                color: overview.color,
              }}
            >
              {overview.score}
            </div>
            <div>
              <p className="text-white text-sm font-semibold">{overview.label}</p>
              <p className="text-gray-500 text-xs">
                {overview.segmentCount > 0
                  ? `${overview.segmentCount} ${navText('сегментов', 'segments', languageCode)}`
                  : navText('Нет данных от пользователей', 'No user traffic data', languageCode)}
              </p>
            </div>
          </div>

          {/* Шкала */}
          <div className="flex gap-0.5 mt-2">
            {Array.from({ length: 10 }, (_, i) => (
              <div
                key={i}
                className="flex-1 h-1.5 rounded-full transition-colors"
                style={{
                  backgroundColor: i < overview.score
                    ? overview.color
                    : 'rgba(255,255,255,0.1)',
                }}
              />
            ))}
          </div>

          <p className="text-gray-600 text-[10px] mt-2 text-center">
            {navText('Данные от пользователей Amap', 'Crowdsourced Amap traffic data', languageCode)}
          </p>
        </div>
      )}
    </div>
  );
}
