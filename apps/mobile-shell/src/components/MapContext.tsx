import type { ReactNode } from 'react';
import { createContext, useContext, useState, useCallback } from 'react';
import type { 
  MapProvider, 
  MapCamera, 
  UserLocation, 
  MapMarker, 
  MapRoute, 
  POI,
  LatLng,
  IMapContext 
} from '../types';

const defaultCamera: MapCamera = {
  center: { lat: 39.9042, lng: 116.4074 }, // Beijing
  zoom: 15,
  heading: 0,
  tilt: 0,
};

const MapContext = createContext<IMapContext | null>(null);

interface MapProviderProps {
  provider?: MapProvider;
  children: ReactNode;
}

export function useMap(): IMapContext {
  const ctx = useContext(MapContext);
  if (!ctx) {
    return {
      provider: 'leaflet',
      camera: defaultCamera,
      userLocation: null,
      isTracking: false,
      setCamera: () => {},
      setUserTracking: () => {},
      addMarker: () => '',
      removeMarker: () => {},
      clearMarkers: () => {},
      setRoute: () => {},
      searchPOI: async () => [],
    };
  }
  return ctx;
}

export function MapProvider({ 
  provider = 'leaflet', 
  children 
}: MapProviderProps) {
  const [camera, setCameraState] = useState<MapCamera>(defaultCamera);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [markers, setMarkers] = useState<Map<MapMarker['id'], MapMarker>>(new Map());
  const [route, setRouteState] = useState<MapRoute | null>(null);

  const setCamera = useCallback((cam: MapCamera) => {
    setCameraState(cam);
  }, []);

  const setUserTracking = useCallback((track: boolean) => {
    setIsTracking(track);
  }, []);

  const addMarker = useCallback((marker: MapMarker): string => {
    const id = marker.id || `marker-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMarkers(prev => {
      const next = new Map(prev);
      next.set(id, { ...marker, id });
      return next;
    });
    return id;
  }, []);

  const removeMarker = useCallback((id: string) => {
    setMarkers(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const clearMarkers = useCallback(() => {
    setMarkers(new Map());
  }, []);

  const setRoute = useCallback((r: MapRoute | null) => {
    setRouteState(r);
  }, []);

  const searchPOI = useCallback(async (query: string, near?: LatLng): Promise<POI[]> => {
    if (provider === 'amap') {
      return searchPOIAmap(query, near);
    }
    return searchPOIOSM(query, near);
  }, [provider]);

  const value: IMapContext = {
    provider,
    camera,
    userLocation,
    isTracking,
    setCamera,
    setUserTracking,
    addMarker,
    removeMarker,
    clearMarkers,
    setRoute,
    searchPOI,
  };

  return (
    <MapContext.Provider value={value}>
      {children}
    </MapContext.Provider>
  );
}

async function searchPOIAmap(query: string, near?: LatLng): Promise<POI[]> {
  console.log('[AmapMap] POI search (mock):', query, near);
  return [];
}

async function searchPOIOSM(query: string, near?: LatLng): Promise<POI[]> {
  // Try offline first
  try {
    const poisResponse = await fetch('/data/osm/processed/pois.json');
    if (poisResponse.ok) {
      const pois = await poisResponse.json();
      const q = query.toLowerCase();
      const results = pois
        .filter((p: any) => p.name?.toLowerCase().includes(q) || p.type?.toLowerCase().includes(q))
        .slice(0, 10)
        .map((p: any) => ({
          id: p.id?.toString() || Math.random().toString(),
          name: p.name || p.type,
          address: p.tags?.['addr:full'] || p.tags?.['addr:street'],
          position: { lat: p.lat, lng: p.lon },
          type: p.type,
        }));
      if (results.length > 0) return results;
    }
  } catch (e) {
    console.log('[Map] Offline POI search unavailable, trying Nominatim');
  }
  
  // Fallback to Nominatim
  try {
    const lat = near?.lat ?? 39.9042;
    const lng = near?.lng ?? 116.4074;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&lat=${lat}&lon=${lng}&limit=10`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mansoni/1.0' },
    });
    
    if (!response.ok) throw new Error('POI search failed');
    
    const data = await response.json();
    return data.map((item: any) => ({
      id: item.place_id.toString(),
      name: item.display_name.split(',')[0],
      address: item.display_name,
      position: { lat: parseFloat(item.lat), lng: parseFloat(item.lon) },
      type: item.type,
    }));
  } catch (error) {
    console.error('[Map] POI search error:', error);
    return [];
  }
}

export { MapContext };
export type { MapCamera, MapMarker, MapRoute, POI, UserLocation };