import { useState, useEffect, useCallback } from 'react';
import type { LatLng } from '../types';
import type { SearchResult } from '../types/navigation';

interface SearchScreenProps {
  onSelect: (result: SearchResult) => void;
  onClose?: () => void;
  initialQuery?: string;
  userLocation?: LatLng | null;
}

const STORAGE_KEY = 'navigation_search_history';

function loadHistory(): SearchResult[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: SearchResult[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 10)));
  } catch (e) {
    console.warn('Failed to save search history:', e);
  }
}

const mockPOIs: SearchResult[] = [
  { id: '1', name: 'Центр', address: 'Москва, Тверская улица', position: { lat: 55.7650, lng: 37.6000 }, type: 'poi' },
  { id: '2', name: 'Парк Горького', address: 'Москва, Крымский вал', position: { lat: 55.7310, lng: 37.6030 }, type: 'poi' },
  { id: '3', name: 'ВДНХ', address: 'Москва, проспект Мира', position: { lat: 55.8300, lng: 37.6330 }, type: 'poi' },
  { id: '4', name: 'Арбат', address: 'Москва, Арбат', position: { lat: 55.7520, lng: 37.5870 }, type: 'poi' },
  { id: '5', name: 'Таганская', address: 'Москва, Таганская площадь', position: { lat: 55.7420, lng: 37.6530 }, type: 'poi' },
  { id: '6', name: 'Курская', address: 'Москва, ул. Земляной вал', position: { lat: 55.7580, lng: 37.6600 }, type: 'poi' },
  { id: '7', name: 'Киевская', address: 'Москва, Киевская площадь', position: { lat: 55.7430, lng: 37.5680 }, type: 'poi' },
  { id: '8', name: 'Павелецкая', address: 'Москва, Павелецкая площадь', position: { lat: 55.7300, lng: 37.6380 }, type: 'poi' },
];

function calculateDistance(pos1: LatLng, pos2: LatLng): number {
  const R = 6371;
  const dLat = (pos2.lat - pos1.lat) * Math.PI / 180;
  const dLon = (pos2.lng - pos1.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(pos1.lat * Math.PI / 180) * Math.cos(pos2.lat * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function SearchScreen({ onSelect, onClose, initialQuery = '', userLocation }: SearchScreenProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [history, setHistory] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  useEffect(() => {
    setHistory(loadHistory());
  }, []);
  
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    
    setIsSearching(true);
    
    const timer = setTimeout(() => {
      const lowerQuery = query.toLowerCase();
      
      const filtered = mockPOIs.filter(poi => 
        poi.name.toLowerCase().includes(lowerQuery) ||
        poi.address.toLowerCase().includes(lowerQuery)
      );
      
      const withDistance = userLocation 
        ? filtered.map(poi => ({
            ...poi,
            distance: calculateDistance(userLocation, poi.position),
          })).sort((a, b) => (a.distance || 0) - (b.distance || 0))
        : filtered;
      
      setResults(withDistance);
      setIsSearching(false);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [query, userLocation]);
  
  const handleSelect = useCallback((result: SearchResult) => {
    const newHistory = [result, ...history.filter(h => h.id !== result.id)].slice(0, 10);
    setHistory(newHistory);
    saveHistory(newHistory);
    onSelect(result);
  }, [history, onSelect]);
  
  const handleClearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);
  
  const formatDistance = (km: number): string => {
    if (km < 1) return `${Math.round(km * 1000)} м`;
    return `${km.toFixed(1)} км`;
  };
  
  const getTypeIcon = (type: string): string => {
    switch (type) {
      case 'favorite': return '⭐';
      case 'history': return '🕐';
      case 'poi': return '📍';
      default: return '📍';
    }
  };
  
  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-4 border-b">
        <div className="flex items-center gap-3">
          {onClose && (
            <button onClick={onClose} className="p-2 -ml-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          
          <div className="flex-1 relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Куда едем?"
              className="w-full px-4 py-3 pl-10 bg-gray-100 rounded-xl text-base"
              autoFocus
            />
            <svg className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            
            {query && (
              <button 
                onClick={() => setQuery('')}
                className="absolute right-3 top-3.5 p-1"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {query ? (
          <div className="p-2">
            {isSearching ? (
              <div className="p-4 text-center text-gray-500">Поиск...</div>
            ) : results.length > 0 ? (
              results.map((result) => (
                <button
                  key={result.id}
                  onClick={() => handleSelect(result)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg text-left"
                >
                  <span className="text-xl">{getTypeIcon(result.type)}</span>
                  <div className="flex-1">
                    <div className="font-medium">{result.name}</div>
                    <div className="text-sm text-gray-500">{result.address}</div>
                  </div>
                  {result.distance !== undefined && (
                    <span className="text-sm text-gray-400">
                      {formatDistance(result.distance)}
                    </span>
                  )}
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-gray-500">Ничего не найдено</div>
            )}
          </div>
        ) : (
          <div className="p-2">
            {history.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm font-medium text-gray-500">Недавние</span>
                  <button onClick={handleClearHistory} className="text-sm text-blue-500">
                    Очистить
                  </button>
                </div>
                
                {history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg text-left"
                  >
                    <span className="text-xl">🕐</span>
                    <div className="flex-1">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-sm text-gray-500">{item.address}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            
            <div className="mb-4">
              <div className="px-3 py-2">
                <span className="text-sm font-medium text-gray-500">Категории</span>
              </div>
              
              <div className="grid grid-cols-4 gap-2 p-2">
                <button 
                  onClick={() => setQuery('ресторан')}
                  className="flex flex-col items-center gap-1 p-3 hover:bg-gray-50 rounded-lg"
                >
                  <span className="text-2xl">🍽️</span>
                  <span className="text-xs">Еда</span>
                </button>
                <button 
                  onClick={() => setQuery('АЗС')}
                  className="flex flex-col items-center gap-1 p-3 hover:bg-gray-50 rounded-lg"
                >
                  <span className="text-2xl">⛽</span>
                  <span className="text-xs">АЗС</span>
                </button>
                <button 
                  onClick={() => setQuery('парковка')}
                  className="flex flex-col items-center gap-1 p-3 hover:bg-gray-50 rounded-lg"
                >
                  <span className="text-2xl">🅿️</span>
                  <span className="text-xs">Парковка</span>
                </button>
                <button 
                  onClick={() => setQuery('магазин')}
                  className="flex flex-col items-center gap-1 p-3 hover:bg-gray-50 rounded-lg"
                >
                  <span className="text-2xl">🛒</span>
                  <span className="text-xs">Магазины</span>
                </button>
                <button 
                  onClick={() => setQuery('аптека')}
                  className="flex flex-col items-center gap-1 p-3 hover:bg-gray-50 rounded-lg"
                >
                  <span className="text-2xl">💊</span>
                  <span className="text-xs">Аптека</span>
                </button>
                <button 
                  onClick={() => setQuery('банк')}
                  className="flex flex-col items-center gap-1 p-3 hover:bg-gray-50 rounded-lg"
                >
                  <span className="text-2xl">🏦</span>
                  <span className="text-xs">Банк</span>
                </button>
                <button 
                  onClick={() => setQuery('гостиница')}
                  className="flex flex-col items-center gap-1 p-3 hover:bg-gray-50 rounded-lg"
                >
                  <span className="text-2xl">🏨</span>
                  <span className="text-xs">Отель</span>
                </button>
                <button 
                  onClick={() => setQuery('парк')}
                  className="flex flex-col items-center gap-1 p-3 hover:bg-gray-50 rounded-lg"
                >
                  <span className="text-2xl">🌳</span>
                  <span className="text-xs">Парк</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SearchScreen;