import { useState, useCallback } from 'react';
import type { POI, LatLng } from '../types';
import { staticDataUrl } from '../lib/staticDataUrl';

interface UsePOISearchOptions {
  provider?: 'osm' | 'amap';
}

interface UsePOISearchResult {
  results: POI[];
  isSearching: boolean;
  error: string | null;
  search: (query: string, near?: LatLng) => Promise<POI[]>;
  clearResults: () => void;
}

export function usePOISearch(options: UsePOISearchOptions = {}): UsePOISearchResult {
  const { provider = 'osm' } = options;
  
  const [results, setResults] = useState<POI[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string, near?: LatLng): Promise<POI[]> => {
    if (!query.trim()) {
      setResults([]);
      return [];
    }

    setIsSearching(true);
    setError(null);

    try {
      let pois: POI[];
      
      if (provider === 'amap') {
        pois = await searchAmap(query, near);
      } else {
        pois = await searchOSM(query, near);
      }
      
      setResults(pois);
      return pois;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Search failed';
      setError(msg);
      setResults([]);
      return [];
    } finally {
      setIsSearching(false);
    }
  }, [provider]);

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return {
    results,
    isSearching,
    error,
    search,
    clearResults,
  };
}

async function searchOSM(query: string, near?: LatLng): Promise<POI[]> {
  const lat = near?.lat ?? 55.7558;
  const lng = near?.lng ?? 37.6173;

  // 1) OFFLINE FIRST — try local data
  try {
    const resp = await fetch(staticDataUrl('/data/osm/processed/search_index.json'));
    if (resp.ok) {
      const index: Array<{
        id: string; name: string; display: string;
        tokens: string[]; lat: number; lon: number; category: string;
      }> = await resp.json();

      if (index.length > 0) {
        const q = query.toLowerCase().trim();
        const scored = index
          .filter(e => e.name.toLowerCase().includes(q) || e.tokens.some(t => t.includes(q) || q.includes(t)))
          .map(e => {
            const dist = Math.sqrt((e.lat - lat) ** 2 + (e.lon - lng) ** 2);
            return { ...e, dist };
          })
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 20);

        if (scored.length > 0) {
          return scored.map(item => ({
            id: item.id,
            name: item.name,
            address: item.display,
            position: { lat: item.lat, lng: item.lon },
            type: item.category,
          }));
        }
      }
    }
  } catch {
    // offline data not available, fall through
  }

  // 2) Nominatim fallback (network required)
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&lat=${lat}&lon=${lng}&limit=20&addressdetails=1`;
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mansoni/1.0 (contact@mansoni.app)',
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`OSM API error: ${response.status}`);
  }

  const data = await response.json();
  
  return data.map((item: any) => ({
    id: item.place_id.toString(),
    name: item.display_name.split(',')[0] || item.name,
    address: item.display_name,
    position: { 
      lat: parseFloat(item.lat), 
      lng: parseFloat(item.lon) 
    },
    type: item.type,
  }));
}

async function searchAmap(query: string, near?: LatLng): Promise<POI[]> {
  console.log('[Amap] POI search (mock):', query, near);
  
  const mockPOIs: POI[] = [
    {
      id: 'amap-1',
      name: `${query} - Location 1`,
      address: 'Example Address 1',
      position: near ?? { lat: 39.9042, lng: 116.4074 },
      type: 'point_of_interest',
    },
    {
      id: 'amap-2',
      name: `${query} - Location 2`,
      address: 'Example Address 2',
      position: { 
        lat: (near?.lat ?? 39.9042) + 0.01, 
        lng: (near?.lng ?? 116.4074) + 0.01 
      },
      type: 'point_of_interest',
    },
  ];
  
  return mockPOIs;
}