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
  // 1) OFFLINE FIRST — try local Dijkstra graph
  try {
    const graphResp = await fetch('/data/osm/graph.json');
    if (graphResp.ok) {
      const graph = await graphResp.json() as {
        nodes: Record<string, { lat: number; lon: number }>;
        edges: Array<{ fromNode: string; toNode: string; distance: number; speed: number; name: string }>;
      };

      if (Object.keys(graph.nodes).length > 0) {
        // Find nearest nodes
        const findNearest = (lat: number, lon: number) => {
          let minDist = Infinity;
          let nearest = '';
          for (const [id, node] of Object.entries(graph.nodes)) {
            const d = Math.sqrt((node.lat - lat) ** 2 + (node.lon - lon) ** 2);
            if (d < minDist) { minDist = d; nearest = id; }
          }
          return nearest;
        };

        const startId = findNearest(from.lat, from.lng);
        const endId = findNearest(to.lat, to.lng);

        if (startId && endId) {
          // Simple Dijkstra
          const dist: Record<string, number> = {};
          const prev: Record<string, string | null> = {};
          const visited = new Set<string>();
          for (const id in graph.nodes) { dist[id] = Infinity; prev[id] = null; }
          dist[startId] = 0;

          while (visited.size < Object.keys(graph.nodes).length) {
            let minD = Infinity, cur: string | null = null;
            for (const id in dist) {
              if (!visited.has(id) && dist[id] < minD) { minD = dist[id]; cur = id; }
            }
            if (cur === null || cur === endId) break;
            visited.add(cur);
            for (const e of graph.edges) {
              if (e.fromNode === cur) {
                const nd = dist[cur] + e.distance;
                if (nd < dist[e.toNode]) { dist[e.toNode] = nd; prev[e.toNode] = cur; }
              }
            }
          }

          if (prev[endId]) {
            const points: LatLng[] = [];
            let c: string | null = endId;
            const path: string[] = [];
            while (c) { path.unshift(c); c = prev[c]; }
            for (const id of path) {
              const n = graph.nodes[id];
              if (n) points.push({ lat: n.lat, lng: n.lon });
            }

            const colors: Record<string, string> = { driving: '#3B82F6', walking: '#22C55E', cycling: '#F59E0B' };
            return { id: `route-${Date.now()}`, points, color: colors[mode], width: 6 };
          }
        }
      }
    }
  } catch {
    // offline not available
  }

  // 2) OSRM fallback
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