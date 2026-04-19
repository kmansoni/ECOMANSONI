import { memo, useEffect } from 'react';
import type maplibregl from 'maplibre-gl';

interface PedestrianMapAdapterProps {
  map: maplibregl.Map | null;
  enabled: boolean;
}

const PEDESTRIAN_LAYER_IDS = [
  'pedestrian-areas',
  'pedestrian-crossings',
] as const;

/**
 * Adapts MapLibre map styles for pedestrian mode:
 * - Highlights sidewalks, footways, crossings in green/yellow
 * - De-emphasizes motorways and car-centric roads
 * - Shows parks and pedestrian zones with fill overlay
 */
export const PedestrianMapAdapter = memo(function PedestrianMapAdapter({
  map,
  enabled,
}: PedestrianMapAdapterProps) {
  useEffect(() => {
    if (!map) return;

    if (!enabled) {
      // Remove pedestrian layers when disabled
      for (const layerId of PEDESTRIAN_LAYER_IDS) {
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId);
        }
      }
      if (map.getSource('pedestrian-overlay')) {
        map.removeSource('pedestrian-overlay');
      }
      return;
    }

    // Adapt road colors: highlight pedestrian-friendly, dim car roads
    try {
      if (map.getLayer('road-simple')) {
        map.setPaintProperty('road-simple', 'line-color', [
          'case',
          ['in', ['get', 'class'], ['literal', ['footway', 'pedestrian', 'path']]],
          '#4ADE80',
          ['in', ['get', 'class'], ['literal', ['crossing']]],
          '#FBBF24',
          ['in', ['get', 'class'], ['literal', ['living_street', 'residential']]],
          '#94A3B8',
          ['in', ['get', 'class'], ['literal', ['motorway', 'trunk']]],
          '#64748B',
          '#CBD5E1',
        ]);

        map.setPaintProperty('road-simple', 'line-width', [
          'case',
          ['in', ['get', 'class'], ['literal', ['footway', 'pedestrian', 'path', 'crossing']]],
          3,
          ['in', ['get', 'class'], ['literal', ['residential', 'living_street']]],
          2,
          ['in', ['get', 'class'], ['literal', ['motorway', 'trunk']]],
          0.5,
          1,
        ]);
      }
    } catch {
      // Layer may not exist in some map styles
    }

    // Add pedestrian area overlay (parks, pedestrian zones)
    try {
      if (!map.getLayer('pedestrian-areas') && map.getSource('openmaptiles')) {
        map.addLayer({
          id: 'pedestrian-areas',
          type: 'fill',
          source: 'openmaptiles',
          'source-layer': 'landuse',
          filter: ['in', 'class', 'park', 'pedestrian', 'recreation_ground', 'garden'],
          paint: {
            'fill-color': '#166534',
            'fill-opacity': 0.2,
          },
        });
      }
    } catch {
      // Source may not support this layer
    }

    return () => {
      // Cleanup on unmount — remove added layers
      try {
        for (const layerId of PEDESTRIAN_LAYER_IDS) {
          if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
          }
        }
      } catch {
        // Map may already be destroyed
      }
    };
  }, [map, enabled]);

  return null;
});
