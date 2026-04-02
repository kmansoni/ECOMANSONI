import { useState, useCallback, useRef, useEffect } from 'react';
import { ArrowLeft, Search, Home, Briefcase, Star, Clock, MapPin, X, Plus, Building2, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SavedPlace } from '@/types/navigation';
import type { LatLng } from '@/types/taxi';
import type { FiasAddress } from '@/types/fias';
import { POI_CATEGORY_ICONS, POI_CATEGORY_LABELS } from '@/types/fias';
import { suggestAddress, suggestOrganization, type OrganizationResult } from '@/lib/navigation/dadata';
import { searchPOIs, type POIResult } from '@/lib/navigation/places';

type SearchTab = 'address' | 'organization' | 'poi';

interface SearchPanelProps {
  favorites: SavedPlace[];
  recents: SavedPlace[];
  currentPosition: LatLng | null;
  onSelectDestination: (place: SavedPlace) => void;
  onClose: () => void;
  onAddPlace?: () => void;
  onSavePlace?: (place: SavedPlace) => void;
}

const PLACE_ICONS: Record<string, React.ElementType> = {
  home: Home,
  work: Briefcase,
  star: Star,
  recent: Clock,
};

const TABS: { id: SearchTab; label: string; icon: React.ElementType }[] = [
  { id: 'address', label: 'Адреса', icon: MapPin },
  { id: 'organization', label: 'Организации', icon: Building2 },
  { id: 'poi', label: 'Места', icon: Store },
];

export function SearchPanel({
  favorites,
  recents,
  currentPosition,
  onSelectDestination,
  onClose,
  onAddPlace,
  onSavePlace,
}: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<SearchTab>('address');
  const [addressResults, setAddressResults] = useState<FiasAddress[]>([]);
  const [orgResults, setOrgResults] = useState<OrganizationResult[]>([]);
  const [poiResults, setPOIResults] = useState<POIResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const performSearch = useCallback(async (text: string, currentTab: SearchTab) => {
    if (text.length < 2) {
      setAddressResults([]);
      setOrgResults([]);
      setPOIResults([]);
      return;
    }
    setLoading(true);
    try {
      if (currentTab === 'address') {
        const results = await suggestAddress(text);
        setAddressResults(results);
      } else if (currentTab === 'organization') {
        const results = await suggestOrganization(text);
        setOrgResults(results);
      } else {
        const results = await searchPOIs(text);
        setPOIResults(results);
      }
    } catch (err) {
      console.warn('[SearchPanel] Ошибка поиска', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(value, tab), 350);
  };

  const handleTabChange = (newTab: SearchTab) => {
    setTab(newTab);
    if (query.length >= 2) {
      performSearch(query, newTab);
    }
  };

  const handleSelectAddress = (addr: FiasAddress) => {
    if (!addr.geoLat || !addr.geoLon) return;
    const place: SavedPlace = {
      id: addr.fiasId ?? `addr-${Date.now()}`,
      name: addr.value.split(',')[0],
      address: addr.value,
      coordinates: { lat: addr.geoLat, lng: addr.geoLon },
      icon: 'star',
      fiasId: addr.fiasId ?? undefined,
      kladrId: addr.kladrId ?? undefined,
      postalCode: addr.postalCode ?? undefined,
      fiasLevel: addr.fiasLevel ?? undefined,
    };
    onSelectDestination(place);
  };

  const handleSelectOrg = (org: OrganizationResult) => {
    if (!org.addressData?.geoLat || !org.addressData?.geoLon) return;
    const place: SavedPlace = {
      id: org.inn ?? `org-${Date.now()}`,
      name: org.name,
      address: org.address || '',
      coordinates: { lat: org.addressData.geoLat, lng: org.addressData.geoLon },
      icon: 'star',
      fiasId: org.addressData.fiasId ?? undefined,
      category: 'organization',
    };
    onSelectDestination(place);
  };

  const handleSelectPOI = (poi: POIResult) => {
    const place: SavedPlace = {
      id: poi.id,
      name: poi.name,
      address: poi.address || '',
      coordinates: poi.coordinates,
      icon: 'star',
      category: poi.category,
    };
    onSelectDestination(place);
  };

  const handleSelectFavorite = (place: SavedPlace) => {
    onSelectDestination(place);
  };

  const configuredFavorites = favorites.filter((f) => f.coordinates.lat !== 0);
  const showSuggestions = query.length < 2;

  return (
    <div className="absolute inset-0 z-[950] bg-gray-950 flex flex-col">
      {/* Search header */}
      <div className="p-3 pt-safe border-b border-white/10">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/5">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              ref={inputRef}
              type="text"
              placeholder={tab === 'address' ? 'Куда едем?' : tab === 'organization' ? 'Название организации' : 'Найти место'}
              value={query}
              onChange={(e) => handleInput(e.target.value)}
              className={cn(
                'w-full h-11 pl-10 pr-10 rounded-xl',
                'bg-gray-800/80 border border-white/10',
                'text-white placeholder:text-gray-500',
                'text-sm focus:outline-none focus:border-blue-500/50',
                'transition-colors'
              )}
            />
            {query && (
              <button
                onClick={() => { setQuery(''); setAddressResults([]); setOrgResults([]); setPOIResults([]); }}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => handleTabChange(t.id)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors',
                  tab === t.id
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-gray-800/50 text-gray-400 border border-transparent hover:bg-gray-700/50'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Favorites */}
        {showSuggestions && configuredFavorites.length > 0 && (
          <div className="p-4">
            <p className="text-xs text-gray-500 font-medium mb-2 uppercase tracking-wider">Избранное</p>
            <div className="flex gap-2 flex-wrap">
              {configuredFavorites.map((fav) => {
                const Icon = PLACE_ICONS[fav.icon] ?? Star;
                return (
                  <button
                    key={fav.id}
                    onClick={() => handleSelectFavorite(fav)}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2.5 rounded-xl',
                      'bg-gray-800/60 border border-white/5',
                      'hover:bg-gray-700/60 transition-colors'
                    )}
                  >
                    <Icon className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-white font-medium">{fav.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Recents */}
        {showSuggestions && recents.length > 0 && (
          <div className="px-4 pb-4">
            <p className="text-xs text-gray-500 font-medium mb-2 uppercase tracking-wider">Недавние</p>
            {recents.map((place) => (
              <button
                key={place.id}
                onClick={() => handleSelectFavorite(place)}
                className="w-full flex items-center gap-3 py-3 px-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                <Clock className="w-4 h-4 text-gray-500 shrink-0" />
                <div className="min-w-0 text-left">
                  <p className="text-sm text-white truncate">{place.name}</p>
                  <p className="text-xs text-gray-500 truncate">{place.address}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Add place button */}
        {showSuggestions && onAddPlace && (
          <div className="px-4 pb-4">
            <button
              onClick={onAddPlace}
              className={cn(
                'w-full flex items-center gap-3 py-3 px-4 rounded-xl',
                'bg-green-500/10 border border-green-500/20',
                'hover:bg-green-500/20 transition-colors'
              )}
            >
              <Plus className="w-5 h-5 text-green-400" />
              <div className="text-left">
                <p className="text-sm text-green-400 font-medium">Добавить место</p>
                <p className="text-xs text-gray-500">Магазин, кафе, организация...</p>
              </div>
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Address results */}
        {!loading && tab === 'address' && addressResults.length > 0 && (
          <div className="px-4 pb-4">
            <p className="text-xs text-gray-500 font-medium mb-2 uppercase tracking-wider">
              Результаты ФИАС
            </p>
            {addressResults.map((addr, i) => (
              <button
                key={addr.fiasId ?? `addr-${i}`}
                onClick={() => handleSelectAddress(addr)}
                className="w-full flex items-center gap-3 py-3 px-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
                <div className="min-w-0 text-left flex-1">
                  <p className="text-sm text-white truncate">{addr.value}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {addr.postalCode && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                        {addr.postalCode}
                      </span>
                    )}
                    {addr.fiasId && (
                      <span className="text-[10px] text-gray-600 truncate">
                        ФИАС: {addr.fiasId.substring(0, 8)}...
                      </span>
                    )}
                    {addr.region && (
                      <span className="text-[10px] text-gray-500">{addr.region}</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Organization results */}
        {!loading && tab === 'organization' && orgResults.length > 0 && (
          <div className="px-4 pb-4">
            <p className="text-xs text-gray-500 font-medium mb-2 uppercase tracking-wider">
              Организации (ЕГРЮЛ)
            </p>
            {orgResults.map((org, i) => (
              <button
                key={org.inn ?? `org-${i}`}
                onClick={() => handleSelectOrg(org)}
                className="w-full flex items-center gap-3 py-3 px-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                <Building2 className="w-4 h-4 text-purple-400 shrink-0" />
                <div className="min-w-0 text-left flex-1">
                  <p className="text-sm text-white truncate">{org.name}</p>
                  {org.address && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">{org.address}</p>
                  )}
                  <div className="flex items-center gap-2 mt-0.5">
                    {org.inn && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                        ИНН: {org.inn}
                      </span>
                    )}
                    {org.status && (
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded',
                        org.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      )}>
                        {org.status === 'ACTIVE' ? 'Действующая' : org.status}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* POI results */}
        {!loading && tab === 'poi' && poiResults.length > 0 && (
          <div className="px-4 pb-4">
            <p className="text-xs text-gray-500 font-medium mb-2 uppercase tracking-wider">
              Места
            </p>
            {poiResults.map((poi) => {
              const catIcon = POI_CATEGORY_ICONS[poi.category as keyof typeof POI_CATEGORY_ICONS] ?? '📍';
              const catLabel = POI_CATEGORY_LABELS[poi.category as keyof typeof POI_CATEGORY_LABELS] ?? poi.category;
              return (
                <button
                  key={poi.id}
                  onClick={() => handleSelectPOI(poi)}
                  className="w-full flex items-center gap-3 py-3 px-2 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <span className="text-lg shrink-0">{catIcon}</span>
                  <div className="min-w-0 text-left flex-1">
                    <p className="text-sm text-white truncate">{poi.name}</p>
                    {poi.address && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{poi.address}</p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                        {catLabel}
                      </span>
                      {poi.rating != null && (
                        <span className="text-[10px] text-yellow-400">
                          ★ {poi.rating.toFixed(1)}
                        </span>
                      )}
                      {poi.isVerified && (
                        <span className="text-[10px] text-blue-400">✓</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* No results */}
        {!loading && query.length >= 2 &&
          ((tab === 'address' && addressResults.length === 0) ||
           (tab === 'organization' && orgResults.length === 0) ||
           (tab === 'poi' && poiResults.length === 0)) && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <MapPin className="w-8 h-8 mb-2" />
            <p className="text-sm">Ничего не найдено</p>
            {tab === 'poi' && onAddPlace && (
              <button
                onClick={onAddPlace}
                className="mt-3 text-sm text-green-400 hover:text-green-300 transition-colors"
              >
                + Добавить новое место
              </button>
            )}
          </div>
        )}

        {/* Quick suggestions (only address tab, empty query) */}
        {showSuggestions && tab === 'address' && recents.length === 0 && configuredFavorites.length === 0 && (
          <div className="px-4 pt-4">
            <p className="text-xs text-gray-500 font-medium mb-3 uppercase tracking-wider">Попробуйте</p>
            {[
              { name: 'Красная площадь', addr: 'Москва, Красная площадь', lat: 55.7539, lng: 37.6208 },
              { name: 'Шереметьево', addr: 'Аэропорт Шереметьево', lat: 55.9726, lng: 37.4146 },
              { name: 'Москва-Сити', addr: 'Деловой центр', lat: 55.7494, lng: 37.5400 },
              { name: 'ВДНХ', addr: 'Проспект Мира, 119', lat: 55.8267, lng: 37.6375 },
            ].map((s, i) => (
              <button
                key={i}
                onClick={() => onSelectDestination({
                  id: `quick-${i}`,
                  name: s.name,
                  address: s.addr,
                  coordinates: { lat: s.lat, lng: s.lng },
                  icon: 'star',
                })}
                className="w-full flex items-center gap-3 py-3 px-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
                <div className="text-left">
                  <p className="text-sm text-white">{s.name}</p>
                  <p className="text-xs text-gray-500">{s.addr}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
