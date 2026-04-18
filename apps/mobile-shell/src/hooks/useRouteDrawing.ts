import { useState, useCallback } from 'react';
import type { LatLng, MapRoute } from '../types';

interface UseRouteDrawingOptions {
  onRouteCalculated?: (route: MapRoute) => void;
  onError?: (error: string) => void;
}

interface UseRouteDrawingResult {
  currentRoute: MapRoute | null;
  isCalculating: boolean;
  drawRoute: (from: LatLng, to: LatLng, mode?: 'driving' | 'walking' | 'cycling') => Promise<void>;
  clearRoute: () => void;
  setRoutePoints: (points: LatLng[], color?: string, width?: number) => void;
}

export function useRouteDrawing(options: UseRouteDrawingOptions = {}): UseRouteDrawingResult {
  const { onRouteCalculated, onError } = options;
  
  const [currentRoute, setCurrentRoute] = useState<MapRoute | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  const drawRoute = useCallback(async (
    from: LatLng,
    to: LatLng,
    mode: 'driving' | 'walking' | 'cycling' = 'driving'
  ) => {
    setIsCalculating(true);
    setCurrentRoute(null);

    try {
      const route = await calculateRoute(from, to, mode);
      setCurrentRoute(route);
      onRouteCalculated?.(route);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Route calculation failed';
      onError?.(msg);
    } finally {
      setIsCalculating(false);
    }
  }, [onRouteCalculated, onError]);

  const clearRoute = useCallback(() => {
    setCurrentRoute(null);
  }, []);

  const setRoutePoints = useCallback((points: LatLng[], color?: string, width?: number) => {
    const route: MapRoute = {
      id: `route-${Date.now()}`,
      points,
      color,
      width,
    };
    setCurrentRoute(route);
    onRouteCalculated?.(route);
  }, [onRouteCalculated]);

  return {
    currentRoute,
    isCalculating,
    drawRoute,
    clearRoute,
    setRoutePoints,
  };
}

async function calculateRoute(
  from: LatLng,
  to: LatLng,
  mode: 'driving' | 'walking' | 'cycling'
): Promise<MapRoute> {
  const profile: Record<string, string> = {
    driving: 'driving-car',
    walking: 'foot',
    cycling: 'cycling-regular',
  };

  const url = `https://router.project-osrm.org/route/v1/${profile[mode]}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;

  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Route API error: ${response.status}`);
  }

  const data = await response.json();
  
  if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
    throw new Error(data.message || 'No route found');
  }

  const route = data.routes[0];
  const points: LatLng[] = route.geometry.coordinates.map(
    (coord: [number, number]) => ({
      lng: coord[0],
      lat: coord[1],
    })
  );

  const colors: Record<string, string> = {
    driving: '#3B82F6',
    walking: '#22C55E',
    cycling: '#F59E0B',
  };

  return {
    id: `route-${Date.now()}`,
    points,
    color: colors[mode],
    width: 6,
  };
}