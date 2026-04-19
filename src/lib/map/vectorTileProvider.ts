/**
 * Vector tile provider — MapTiler + OpenMapTiles + CartoDB fallback.
 *
 * Priority:
 *   1. MapTiler (VITE_MAPTILER_KEY) — best quality, global, vector
 *   2. CartoDB (free) — fallback, decent quality
 *
 * Also provides production MapLibre style with enhanced road rendering.
 */

// ── Style URLs ──────────────────────────────────────────────────────────────

function getMapTilerKey(): string | null {
  try {
    return (import.meta as unknown as Record<string, Record<string, string>>).env?.VITE_MAPTILER_KEY ?? null;
  } catch {
    return null;
  }
}

export type MapTheme = 'dark' | 'light' | 'satellite' | 'streets';

interface StyleConfig {
  url: string;
  name: string;
  isVector: boolean;
}

/** Get available map styles in priority order */
export function getMapStyles(): Record<MapTheme, StyleConfig> {
  const key = getMapTilerKey();

  if (key) {
    return {
      dark: {
        url: `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${key}`,
        name: 'MapTiler Dark',
        isVector: true,
      },
      light: {
        url: `https://api.maptiler.com/maps/dataviz-light/style.json?key=${key}`,
        name: 'MapTiler Light',
        isVector: true,
      },
      satellite: {
        url: `https://api.maptiler.com/maps/hybrid/style.json?key=${key}`,
        name: 'MapTiler Satellite',
        isVector: true,
      },
      streets: {
        url: `https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`,
        name: 'MapTiler Streets',
        isVector: true,
      },
    };
  }

  // Fallback: CartoDB free tiles
  return {
    dark: {
      url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      name: 'CartoDB Dark',
      isVector: true,
    },
    light: {
      url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      name: 'CartoDB Light',
      isVector: true,
    },
    satellite: {
      url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
      name: 'CartoDB Voyager',
      isVector: true,
    },
    streets: {
      url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
      name: 'CartoDB Voyager',
      isVector: true,
    },
  };
}

/** Get the best available style URL for a theme */
export function getStyleUrl(theme: MapTheme = 'dark'): string {
  return getMapStyles()[theme].url;
}

/** Whether we have MapTiler (premium) vector tiles */
export function hasMapTiler(): boolean {
  return getMapTilerKey() !== null;
}

// ── Enhanced road rendering layers ──────────────────────────────────────────

/**
 * Add enhanced road layers to an existing MapLibre map.
 * This adds better street labels, road outlines, and house numbers.
 *
 * @param map - MapLibre map instance
 * @param labelSizeMultiplier - Multiplier for label text size (0.7-1.5)
 * @param highContrast - Enable extra-strong halo for maximum readability
 */
export function addEnhancedRoadLayers(
  map: maplibregl.Map,
  labelSizeMultiplier: number = 1.0,
  highContrast: boolean = false
) {
  const style = map.getStyle();
  if (!style?.sources) return;

  // Find vector source
  const sourceId = Object.keys(style.sources).find(k =>
    k.includes('openmaptiles') || k.includes('carto') || k.includes('maptiler') || k === 'composite'
  );
  if (!sourceId) return;

   // ── Enhanced street names (bigger, more readable) ────────────────────
   try {
     // Remove existing road labels to replace with better ones
     const existingLabels = style.layers?.filter(l =>
       l.id.includes('road') && l.type === 'symbol' && !l.id.includes('highway')
     ) ?? [];

     // Compute scaled sizes
     const baseSizes = [11, 13, 15, 17, 19];
     const scaledSizes = baseSizes.map(s => s * labelSizeMultiplier);
     const [s12, s14, s16, s18, s20] = scaledSizes;

     // Halo settings based on contrast mode
     const haloWidth = highContrast ? 4 : 3;
     const haloBlur = highContrast ? 0 : 0.5;

     // Add enhanced road name labels
     map.addLayer({
       id: 'enhanced-road-labels',
       type: 'symbol',
       source: sourceId,
       'source-layer': 'transportation_name',
       minzoom: 12,
       layout: {
         'text-field': ['coalesce', ['get', 'name:ru'], ['get', 'name:latin'], ['get', 'name']],
         'text-font': ['Noto Sans Regular'],
         'text-size': [
           'interpolate', ['linear'], ['zoom'],
           12, s12,
           14, s14,
           16, s16,
           18, s18,
           20, s20,
         ],
         'symbol-placement': 'line',
         'text-rotation-alignment': 'map',
         'text-pitch-alignment': 'viewport',
         'text-max-angle': 30,
         'text-allow-overlap': false,
         'text-ignore-placement': false,
         'text-padding': 2,
         'text-keep-upright': true,
       },
       paint: {
         'text-color': 'rgba(255, 255, 255, 0.95)',
         'text-halo-color': 'rgba(0, 0, 0, 0.95)',
         'text-halo-width': haloWidth,
         'text-halo-blur': haloBlur,
       },
     });
  } catch (e) {
    console.warn('[VectorTiles] Enhanced road labels:', e);
  }

   // ── House numbers at high zoom ──────────────────────────────────────
   try {
     const baseHNSizes = [10, 13, 15];
     const scaledHNSizes = baseHNSizes.map(s => s * labelSizeMultiplier);
     const [hn16, hn18, hn20] = scaledHNSizes;

     map.addLayer({
       id: 'enhanced-house-numbers',
       type: 'symbol',
       source: sourceId,
       'source-layer': 'housenumber',
       minzoom: 16,
       layout: {
         'text-field': ['get', 'housenumber'],
         'text-font': ['Noto Sans Regular'],
         'text-size': [
           'interpolate', ['linear'], ['zoom'],
           16, hn16,
           18, hn18,
           20, hn20,
         ],
         'text-allow-overlap': false,
         'text-padding': 4,
         'text-keep-upright': true,
       },
       paint: {
         'text-color': 'rgba(255, 255, 255, 0.9)',
         'text-halo-color': 'rgba(0, 0, 0, 0.9)',
         'text-halo-width': highContrast ? 3 : 2,
         'text-halo-blur': highContrast ? 0 : 0.5,
       },
     });
  } catch (e) {
    console.warn('[VectorTiles] House numbers:', e);
  }

  // ── Speed limit labels on major roads ───────────────────────────────
  try {
    map.addLayer({
      id: 'enhanced-speed-labels',
      type: 'symbol',
      source: sourceId,
      'source-layer': 'transportation',
      minzoom: 14,
      filter: ['has', 'maxspeed'],
      layout: {
        'text-field': ['concat', ['get', 'maxspeed'], ''],
        'text-font': ['Noto Sans Bold'],
        'text-size': 10,
        'symbol-placement': 'line',
        'symbol-spacing': 500,
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#FF5252',
        'text-halo-color': 'rgba(255, 255, 255, 0.9)',
        'text-halo-width': 2,
      },
    });
  } catch (e) {
    console.warn('[VectorTiles] Speed labels:', e);
  }
}

// ── Terrain (3D relief) ─────────────────────────────────────────────────────

/** Add 3D terrain from MapTiler (requires key) */
export function addTerrain(map: maplibregl.Map) {
  const key = getMapTilerKey();
  if (!key) return;

  try {
    map.addSource('terrain-source', {
      type: 'raster-dem',
      url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${key}`,
      tileSize: 256,
    });

    map.setTerrain({ source: 'terrain-source', exaggeration: 0.3 });

    // Sky layer for 3D views
    map.addLayer({
      id: 'sky',
      type: 'sky' as unknown as 'background',
      paint: {
        'sky-type': 'atmosphere' as unknown as string,
        'sky-atmosphere-sun': [0, 0] as unknown as string,
        'sky-atmosphere-sun-intensity': 15 as unknown as number,
      } as unknown as maplibregl.BackgroundLayerSpecification['paint'],
    });
  } catch (e) {
    console.warn('[VectorTiles] Terrain:', e);
  }
}

// ── Auto theme (day/night) ──────────────────────────────────────────────────

/** Determine theme based on time of day */
export function getAutoTheme(): MapTheme {
  const hour = new Date().getHours();
  return (hour >= 6 && hour < 20) ? 'light' : 'dark';
}

// Re-export for type usage elsewhere
import type maplibregl from 'maplibre-gl';
