/**
 * Vector tile provider — OSM free tiles (OpenFreeMap) with MapTiler override.
 *
 * Priority:
 *   1. MapTiler (VITE_MAPTILER_KEY) — if key provided, use MapTiler vectors
 *   2. OpenFreeMap (free) — OSM-derived vector tiles, no API key needed
 *
 * Also provides production MapLibre style with enhanced road rendering.
 */

import type maplibregl from 'maplibre-gl';
import { applyProductionStyleEnhancements, getProductionPalette, type ProductionMapMode } from './mapStyles';
import { getMapLabelTextFieldExpression } from '@/lib/localization/appLocale';

// ── Style URLs ──────────────────────────────────────────────────────────────

function getMapTilerKey(): string | null {
  try {
    return (import.meta as unknown as Record<string, Record<string, string>>).env?.VITE_MAPTILER_KEY ?? null;
  } catch {
    return null;
  }
}

export type MapTheme = ProductionMapMode;

interface StyleConfig {
  url: string;
  name: string;
  isVector: boolean;
}

/** Get available map styles in priority order */
export function getMapStyles(): Record<MapTheme, StyleConfig> {
   const key = getMapTilerKey();

   // Base OSM-derived free tiles from OpenFreeMap
   // NOTE: OpenFreeMap serves style JSON at /styles/{name} (no /style.json suffix)
   const baseStyles: Record<MapTheme, StyleConfig> = {
     dark: {
       url: 'https://tiles.openfreemap.org/styles/dark',
       name: 'OpenFreeMap Dark',
       isVector: true,
     },
     light: {
       url: 'https://tiles.openfreemap.org/styles/bright',
       name: 'OpenFreeMap Bright',
       isVector: true,
     },
     satellite: {
       url: 'https://tiles.openfreemap.org/styles/liberty',
       name: 'OpenFreeMap Liberty',
       isVector: true,
     },
     hybrid: {
       url: 'https://tiles.openfreemap.org/styles/liberty',
       name: 'OpenFreeMap Liberty',
       isVector: true,
     },
     terrain: {
       url: 'https://tiles.openfreemap.org/styles/liberty',
       name: 'OpenFreeMap Liberty',
       isVector: true,
     },
     streets: {
       url: 'https://tiles.openfreemap.org/styles/liberty',
       name: 'OpenFreeMap Liberty',
       isVector: true,
     },
     voyager: {
       url: 'https://tiles.openfreemap.org/styles/bright',
       name: 'OpenFreeMap Bright',
       isVector: true,
     },
     positron: {
       url: 'https://tiles.openfreemap.org/styles/positron',
       name: 'OpenFreeMap Positron',
       isVector: true,
     },
     darkNolabels: {
       url: 'https://tiles.openfreemap.org/styles/dark',
       name: 'OpenFreeMap Dark',
       isVector: true,
     },
   };

   // If MapTiler key is present, override with MapTiler styles (higher quality)
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
       hybrid: {
         url: `https://api.maptiler.com/maps/hybrid/style.json?key=${key}`,
         name: 'MapTiler Hybrid',
         isVector: true,
       },
       terrain: {
         url: `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${key}`,
         name: 'MapTiler Terrain',
         isVector: true,
       },
       streets: {
         url: `https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`,
         name: 'MapTiler Streets',
         isVector: true,
       },
       voyager: {
         url: `https://api.maptiler.com/maps/dataviz-light/style.json?key=${key}`,
         name: 'MapTiler Voyager Alias',
         isVector: true,
       },
       positron: {
         url: `https://api.maptiler.com/maps/dataviz-light/style.json?key=${key}`,
         name: 'MapTiler Positron Alias',
         isVector: true,
       },
       darkNolabels: {
         url: `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${key}`,
         name: 'MapTiler Dark Alias',
         isVector: true,
       },
     };
   }

   return baseStyles;
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
  highContrast: boolean = false,
  theme: MapTheme = 'dark',
  languageCode?: string | null,
) {
  const style = map.getStyle();
  if (!style?.sources) return;
  const palette = getProductionPalette(theme);

  // Find vector source
  const sourceId = Object.keys(style.sources).find(k =>
    k.includes('openmaptiles') || k.includes('carto') || k.includes('maptiler') || k === 'composite'
  );
  if (!sourceId) return;

   // ── Enhanced street names (bigger, more readable) ────────────────────
   try {
     removeLayerIfExists(map, 'enhanced-road-labels');

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
         'text-field': getMapLabelTextFieldExpression(languageCode) as unknown as maplibregl.ExpressionSpecification,
         'text-font': ['Noto Sans Bold', 'Noto Sans Regular', 'Open Sans Bold'],
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
         'text-color': palette.roadLabelText,
         'text-halo-color': palette.labelHalo,
         'text-halo-width': haloWidth,
         'text-halo-blur': haloBlur,
       },
     });
  } catch (e) {
    console.warn('[VectorTiles] Enhanced road labels:', e);
  }

   // ── House numbers at high zoom ──────────────────────────────────────
   try {
     removeLayerIfExists(map, 'enhanced-house-numbers');
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
         'text-font': ['Noto Sans Regular', 'Noto Sans Bold', 'Open Sans Bold'],
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
         'text-color': palette.houseNumberText,
         'text-halo-color': palette.houseNumberHalo,
         'text-halo-width': highContrast ? 3 : 2,
         'text-halo-blur': highContrast ? 0 : 0.5,
       },
     });
  } catch (e) {
    console.warn('[VectorTiles] House numbers:', e);
  }

  // ── Speed limit labels on major roads ───────────────────────────────
  try {
    removeLayerIfExists(map, 'enhanced-speed-labels');
    map.addLayer({
      id: 'enhanced-speed-labels',
      type: 'symbol',
      source: sourceId,
      'source-layer': 'transportation',
      minzoom: 14,
      filter: ['has', 'maxspeed'],
      layout: {
        'text-field': ['concat', ['get', 'maxspeed'], ''],
        'text-font': ['Open Sans Bold', 'Noto Sans Regular'],
        'text-size': 10,
        'symbol-placement': 'line',
        'symbol-spacing': 500,
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': palette.speedLabelText,
        'text-halo-color': palette.speedLabelHalo,
        'text-halo-width': 2,
      },
    });
  } catch (e) {
    console.warn('[VectorTiles] Speed labels:', e);
  }
}

export function applyMapThemeEnhancements(map: maplibregl.Map, theme: MapTheme = 'dark', languageCode?: string | null) {
  applyProductionStyleEnhancements(map, theme, languageCode);
}

// ── Terrain (3D relief) ─────────────────────────────────────────────────────

/** Add 3D terrain from MapTiler (if key available) or free Copernicus DEM */
export function addTerrain(map: maplibregl.Map) {
   const key = getMapTilerKey();

   try {
     if (key) {
       // MapTiler terrain-rgb v2
       map.addSource('terrain-source', {
         type: 'raster-dem',
         url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${key}`,
         tileSize: 256,
       });
     } else {
       // Free global terrain-rgb tiles (Copernicus) via AWS public bucket
       // Source: https://registry.opendata.aws/copernicus-dem/
       map.addSource('terrain-source', {
         type: 'raster-dem',
         url: 'https://terrain-tiles.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png',
         tileSize: 256,
       });
     }

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

function removeLayerIfExists(map: maplibregl.Map, layerId: string) {
  if (map.getLayer(layerId)) {
    map.removeLayer(layerId);
  }
}
