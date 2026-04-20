import { MapPin, Navigation, Star, Phone, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { POIResult } from '@/lib/navigation/places';
import { getPoiCategoryLabel, POI_CATEGORY_ICONS, type POICategory } from '@/types/fias';
import { useUserSettings } from '@/contexts/UserSettingsContext';
import { navText } from '@/lib/navigation/navigationUi';

interface POIListProps {
  pois: POIResult[];
  onNavigate: (poi: POIResult) => void;
  onSelect?: (poi: POIResult) => void;
  className?: string;
}

export function POIList({ pois, onNavigate, onSelect, className }: POIListProps) {
  const { settings } = useUserSettings();
  const languageCode = settings?.language_code ?? null;
  if (pois.length === 0) return null;

  return (
    <div className={cn('space-y-2', className)}>
      {pois.map((poi) => {
        const catIcon = POI_CATEGORY_ICONS[poi.category as keyof typeof POI_CATEGORY_ICONS] ?? '📍';
        const catLabel = getPoiCategoryLabel(poi.category as POICategory, languageCode);

        return (
          <div
            key={poi.id}
            onClick={() => onSelect?.(poi)}
            className={cn(
              'p-3 rounded-xl border transition-colors',
              'bg-gray-800/60 border-white/5',
              onSelect && 'cursor-pointer hover:bg-gray-700/60'
            )}
          >
            <div className="flex items-start gap-3">
              {/* Category icon */}
              <div className="w-10 h-10 rounded-xl bg-gray-700/60 flex items-center justify-center text-lg shrink-0">
                {catIcon}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-white font-medium truncate">{poi.name}</p>
                  {poi.isVerified && (
                    <span className="text-[10px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400">✓</span>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
                    {catLabel}
                  </span>
                  {poi.rating != null && (
                    <span className="flex items-center gap-0.5 text-[10px] text-yellow-400">
                      <Star className="w-2.5 h-2.5" />
                      {poi.rating.toFixed(1)}
                      {poi.reviewCount > 0 && (
                        <span className="text-gray-500 ml-0.5">({poi.reviewCount})</span>
                      )}
                    </span>
                  )}
                </div>

                {poi.address && (
                  <p className="text-xs text-gray-500 mt-1 truncate">{poi.address}</p>
                )}

                {/* Contact info */}
                <div className="flex items-center gap-3 mt-1.5">
                  {poi.phone && (
                    <a
                      href={`tel:${poi.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300"
                    >
                      <Phone className="w-2.5 h-2.5" />
                      {poi.phone}
                    </a>
                  )}
                  {poi.website && (
                    <a
                      href={poi.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      {navText('Сайт', 'Website', languageCode)}
                    </a>
                  )}
                </div>
              </div>

              {/* Navigate button */}
              <button
                onClick={(e) => { e.stopPropagation(); onNavigate(poi); }}
                className={cn(
                  'w-10 h-10 rounded-xl shrink-0',
                  'bg-green-500/20 border border-green-500/30',
                  'flex items-center justify-center',
                  'hover:bg-green-500/30 transition-colors'
                )}
                aria-label={navText('Проложить маршрут', 'Navigate', languageCode)}
              >
                <Navigation className="w-4 h-4 text-green-400" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
