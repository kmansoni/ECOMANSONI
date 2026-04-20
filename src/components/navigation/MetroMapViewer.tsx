import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { sanitizeSvg } from '@/lib/security/safeHtml';
import {
  loadMetroCity,
  getMetroSvg,
  buildMetroRoute,
  localizeStationName,
  type MetroCity,
  type MetroStation,
  type MetroRoute,
} from '@/lib/transit/metroSchemaDB';
import { useUserSettings } from '@/contexts/UserSettingsContext';
import { navText } from '@/lib/navigation/navigationUi';

interface MetroMapViewerProps {
  city: string;
  fromStation?: string;
  toStation?: string;
  onStationSelect?: (station: MetroStation) => void;
  className?: string;
}

export const MetroMapViewer = memo(function MetroMapViewer({
  city,
  fromStation,
  toStation,
  onStationSelect,
  className,
}: MetroMapViewerProps) {
  const { settings } = useUserSettings();
  const languageCode = settings?.language_code ?? null;
  const [metroCity, setMetroCity] = useState<MetroCity | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [route, setRoute] = useState<MetroRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStation, setSelectedStation] = useState<MetroStation | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const safeSvgContent = useMemo(() => (svgContent ? sanitizeSvg(svgContent) : null), [svgContent]);

  // Load metro data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([loadMetroCity(city), getMetroSvg(city)])
      .then(([cityData, svg]) => {
        if (cancelled) return;
        setMetroCity(cityData);
        setSvgContent(svg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [city]);

  // Build route when from/to change
  useEffect(() => {
    if (!metroCity || !fromStation || !toStation) {
      setRoute(null);
      return;
    }
    const result = buildMetroRoute(city, fromStation, toStation);
    setRoute(result);
  }, [city, metroCity, fromStation, toStation]);

  const handleStationClick = useCallback((station: MetroStation) => {
    setSelectedStation(station);
    onStationSelect?.(station);
  }, [onStationSelect]);

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-400">{navText('Загрузка схемы метро...', 'Loading metro map...', languageCode)}</span>
        </div>
      </div>
    );
  }

  if (!metroCity) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <p className="text-sm text-gray-500">{navText(`Схема метро для «${city}» не найдена`, `Metro map for “${city}” was not found`, languageCode)}</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* SVG Schema (if available) */}
      {safeSvgContent && (
        <div
          ref={containerRef}
          className="overflow-auto rounded-xl border border-white/5 bg-gray-900/50 max-h-[50vh] touch-pan-x touch-pan-y"
          dangerouslySetInnerHTML={{ __html: safeSvgContent }}
        />
      )}

      {/* Fallback: List of lines and stations */}
      {!safeSvgContent && (
        <div className="space-y-3">
          {metroCity.lines.map(line => (
            <div key={line.id}>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: `#${line.color}` }} />
                <span className="text-sm font-medium text-white">{line.name}</span>
                <span className="text-xs text-gray-500">{line.stations.length} {navText('ст.', 'st.', languageCode)}</span>
              </div>
              <div className="ml-4 flex flex-wrap gap-1">
                {line.stations.map(st => {
                  const isOnRoute = route?.stations.some(rs => rs.id === st.id);
                  const isSelected = selectedStation?.id === st.id;
                  return (
                    <button
                      key={st.id}
                      onClick={() => handleStationClick(st)}
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full transition-colors',
                        isOnRoute ? 'bg-blue-500/30 text-blue-300 ring-1 ring-blue-500/50' :
                        isSelected ? 'bg-white/20 text-white' :
                        'bg-white/5 text-gray-400 hover:bg-white/10'
                      )}
                    >
                      {localizeStationName(st)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Route summary */}
      {route && (
        <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-300">
              🚇 {navText('Маршрут в метро', 'Metro route', languageCode)}
            </span>
            <span className="text-xs text-gray-400">
              ~{Math.round(route.totalTimeMinutes)} {navText('мин', 'min', languageCode)}
            </span>
          </div>
          <div className="space-y-1">
            {route.segments.map((seg, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: `#${seg.line.color}` }} />
                <span className="text-gray-300">
                  {localizeStationName(seg.from)} → {localizeStationName(seg.to)}
                </span>
                <span className="text-gray-500 ml-auto">
                  {seg.stationCount} {navText('ст.', 'st.', languageCode)} · {Math.round(seg.durationMinutes)} {navText('мин', 'min', languageCode)}
                </span>
              </div>
            ))}
          </div>
          {route.transfers > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              {navText('Пересадок', 'Transfers', languageCode)}: {route.transfers}
            </p>
          )}
        </div>
      )}

      {/* Station detail popup */}
      {selectedStation && (
        <div className="p-3 rounded-xl bg-gray-800/80 border border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">
              {localizeStationName(selectedStation)}
            </span>
            <button
              onClick={() => setSelectedStation(null)}
              className="text-xs text-gray-500 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="flex gap-2 mt-1 text-xs text-gray-400">
            {selectedStation.wheelchairAccessible && <span>♿ {navText('Доступна', 'Accessible', languageCode)}</span>}
            {selectedStation.transferStations.length > 0 && (
              <span>🔄 {navText('Пересадки', 'Transfers', languageCode)}: {selectedStation.transferStations.length}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
