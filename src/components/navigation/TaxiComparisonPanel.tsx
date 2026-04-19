import { memo, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { LatLng, TaxiRouteEstimateResponse } from '@/types/taxi';
import { fetchTaxiEstimateMulti } from '@/lib/taxi/costComparer';

interface TaxiComparisonPanelProps {
  pickup: LatLng;
  destination: LatLng;
  viaPoints: LatLng[];
  onSelectDirect?: () => void;
  onSelectViaPoint?: (index: number) => void;
  className?: string;
}

export const TaxiComparisonPanel = memo(function TaxiComparisonPanel({
  pickup,
  destination,
  viaPoints,
  onSelectDirect,
  onSelectViaPoint,
  className,
}: TaxiComparisonPanelProps) {
  const [data, setData] = useState<TaxiRouteEstimateResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchTaxiEstimateMulti(pickup, destination, viaPoints)
      .then(result => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        // Silently fail — taxi estimates are optional
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [pickup, destination, viaPoints]);

  if (loading) {
    return (
      <div className={cn('p-3 rounded-xl bg-gray-900/60 border border-white/5 animate-pulse', className)}>
        <div className="h-4 bg-white/10 rounded w-32 mb-2" />
        <div className="h-10 bg-white/5 rounded" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className={cn('p-3 rounded-xl bg-gray-900/60 border border-white/5', className)}>
      <p className="text-xs font-medium text-gray-400 mb-2">🚕 Альтернатива: такси</p>

      {/* Direct ride */}
      <button
        onClick={onSelectDirect}
        className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors mb-1"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">🚗</span>
          <span className="text-sm text-gray-300">Напрямую</span>
        </div>
        <div className="text-right">
          <span className="text-sm font-semibold text-white">
            {data.direct.estimatedPrice} ₽
          </span>
          <span className="text-xs text-gray-500 ml-2">
            ~{data.direct.estimatedDuration} мин
          </span>
        </div>
      </button>

      {/* Via-point alternatives (show top 3) */}
      {data.fromViaPoints.slice(0, 3).map((vp, i) => (
        <button
          key={i}
          onClick={() => onSelectViaPoint?.(i)}
          className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">🔄</span>
            <span className="text-xs text-gray-400">От пересадки {i + 1}</span>
          </div>
          <div className="text-right flex items-center gap-2">
            <span className="text-sm font-semibold text-white">
              {vp.toDestination.estimatedPrice} ₽
            </span>
            {vp.savings.moneySavedRub > 0 && (
              <span className="text-xs text-green-400">
                -{vp.savings.moneySavedRub} ₽
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
});
