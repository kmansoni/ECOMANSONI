import type maplibregl from 'maplibre-gl';
import type { Feature, FeatureCollection, GeoJsonProperties, Point } from 'geojson';
import type { NavigationMapObject } from '@/types/navigation';
import { logger } from '@/lib/logger';
import { getProductionPalette, type ProductionMapMode } from './mapStyles';

const NAV_SOURCE_ID = 'nav-objects-source';
const NAV_LAYER_PREFIX = 'nav-layer-';

interface EnsureNavigationLayersOptions {
  labelSizeMultiplier?: number;
  highContrast?: boolean;
  theme?: ProductionMapMode;
}

type NavigationLayerSpec = maplibregl.LayerSpecification & {
  id: string;
  source?: string;
  'source-layer'?: string;
};

export function ensureNavigationLayers(
  map: maplibregl.Map,
  options: EnsureNavigationLayersOptions = {},
): void {
  const style = map.getStyle();
  if (!style?.sources) return;

  const sourceId = findVectorSourceId(style);
  if (!sourceId) return;

  const sourceLayers = getSourceLayers(style, sourceId);
  const beforeId = findFirstSymbolLayerId(style);
  const labelSizeMultiplier = options.labelSizeMultiplier ?? 1;
  const palette = getProductionPalette(options.theme ?? 'dark');
  const haloColor = palette.labelHalo;

  addOrReplaceLayer(map, {
    id: `${NAV_LAYER_PREFIX}road-casing`,
    type: 'line',
    source: sourceId,
    'source-layer': 'transportation',
    filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'street', 'service'], true, false],
    minzoom: 8,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['case', ['==', ['get', 'brunnel'], 'tunnel'], palette.tunnelCasing, palette.roadCasing],
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        8, ['match', ['get', 'class'], 'motorway', 5, 'trunk', 4.5, 'primary', 4, 'secondary', 3.5, 'tertiary', 3, 'street', 2.5, 2],
        16, ['match', ['get', 'class'], 'motorway', 20, 'trunk', 17, 'primary', 15, 'secondary', 12, 'tertiary', 10, 'street', 8, 6],
      ],
      'line-opacity': 0.95,
    },
  }, sourceLayers, beforeId);

  addOrReplaceLayer(map, {
    id: `${NAV_LAYER_PREFIX}road-fill`,
    type: 'line',
    source: sourceId,
    'source-layer': 'transportation',
    filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'street', 'service'], true, false],
    minzoom: 8,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': [
        'match',
        ['get', 'surface'],
        'unpaved', '#A16207',
        'gravel', '#B45309',
        'dirt', '#92400E',
        ['case',
          ['==', ['get', 'class'], 'motorway'], palette.motorwayRoad,
          ['==', ['get', 'class'], 'trunk'], palette.trunkRoad,
          ['==', ['get', 'class'], 'primary'], palette.primaryRoad,
          ['==', ['get', 'class'], 'secondary'], palette.secondaryRoad,
          ['==', ['get', 'class'], 'service'], palette.serviceRoad,
          palette.localRoad,
        ],
      ],
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        8, ['match', ['get', 'class'], 'motorway', 3.2, 'trunk', 2.8, 'primary', 2.4, 'secondary', 2.1, 'tertiary', 1.8, 'street', 1.6, 1.3],
        16, ['match', ['get', 'class'], 'motorway', 14, 'trunk', 12, 'primary', 10, 'secondary', 8, 'tertiary', 7, 'street', 5.5, 4.5],
      ],
      'line-opacity': 0.96,
    },
  }, sourceLayers, beforeId);

  addOrReplaceLayer(map, {
    id: `${NAV_LAYER_PREFIX}toll-emphasis`,
    type: 'line',
    source: sourceId,
    'source-layer': 'transportation',
    filter: ['any', ['==', ['to-string', ['coalesce', ['get', 'toll'], '']], 'yes'], ['==', ['to-string', ['coalesce', ['get', 'fee'], '']], 'yes']],
    minzoom: 9,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#F7C948',
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.2, 15, 3.8, 18, 5.4],
      'line-opacity': 0.85,
      'line-dasharray': [1.2, 1.2],
    },
  }, sourceLayers, beforeId);

  addOrReplaceLayer(map, {
    id: `${NAV_LAYER_PREFIX}centerline`,
    type: 'line',
    source: sourceId,
    'source-layer': 'transportation',
    filter: ['all', ['match', ['get', 'class'], ['primary', 'secondary', 'tertiary'], true, false], ['!=', ['coalesce', ['get', 'oneway'], 0], 1]],
    minzoom: 12,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': palette.centerLine,
      'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.8, 17, 2],
      'line-dasharray': [2, 2],
      'line-opacity': 0.75,
    },
  }, sourceLayers, beforeId);

  addOrReplaceLayer(map, {
    id: `${NAV_LAYER_PREFIX}bridge-emphasis`,
    type: 'line',
    source: sourceId,
    'source-layer': 'transportation',
    filter: ['==', ['get', 'brunnel'], 'bridge'],
    minzoom: 12,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': palette.labelText,
      'line-width': ['interpolate', ['linear'], ['zoom'], 12, 4, 17, 14],
      'line-blur': 0.6,
      'line-opacity': 0.22,
      'line-translate': [0, -1],
    },
  }, sourceLayers, beforeId);

  addOrReplaceLayer(map, {
    id: `${NAV_LAYER_PREFIX}tunnel-emphasis`,
    type: 'line',
    source: sourceId,
    'source-layer': 'transportation',
    filter: ['==', ['get', 'brunnel'], 'tunnel'],
    minzoom: 12,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': palette.tunnelCasing,
      'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2.6, 17, 8],
      'line-dasharray': [1.5, 1.5],
      'line-opacity': 0.65,
    },
  }, sourceLayers, beforeId);

  addOrReplaceLayer(map, {
    id: `${NAV_LAYER_PREFIX}road-shields`,
    type: 'symbol',
    source: sourceId,
    'source-layer': 'transportation_name',
    filter: ['has', 'ref'],
    minzoom: 9,
    layout: {
      'text-field': ['get', 'ref'],
      'symbol-placement': 'line-center',
      'text-font': ['Open Sans Bold', 'Noto Sans Regular'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 9, 9 * labelSizeMultiplier, 15, 12 * labelSizeMultiplier],
      'text-padding': 2,
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': palette.shieldText,
      'text-halo-color': haloColor,
      'text-halo-width': 2,
      'text-halo-blur': 0.3,
    },
  }, sourceLayers, undefined);

  addFirstAvailableLayer(map, {
    id: `${NAV_LAYER_PREFIX}rail-casing`,
    type: 'line',
    source: sourceId,
    minzoom: 9,
    filter: ['match', ['coalesce', ['get', 'class'], ['get', 'subclass']], ['rail', 'transit', 'subway', 'tram', 'light_rail', 'monorail'], true, false],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': 'rgba(15, 23, 42, 0.92)',
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.8, 15, 4.2, 18, 6],
      'line-opacity': 0.72,
    },
  }, ['transportation'], sourceLayers, beforeId);

  addRailVariantLayer(map, sourceId, sourceLayers, beforeId, {
    idSuffix: 'rail-lines-main',
    classes: ['rail', 'transit'],
    color: '#A3B1C6',
  });

  addRailVariantLayer(map, sourceId, sourceLayers, beforeId, {
    idSuffix: 'rail-lines-subway',
    classes: ['subway'],
    color: '#3B82F6',
    dasharray: [0.5, 0.75],
  });

  addRailVariantLayer(map, sourceId, sourceLayers, beforeId, {
    idSuffix: 'rail-lines-tram',
    classes: ['tram'],
    color: '#F97316',
    dasharray: [1, 0.9],
  });

  addRailVariantLayer(map, sourceId, sourceLayers, beforeId, {
    idSuffix: 'rail-lines-light',
    classes: ['light_rail'],
    color: '#8B5CF6',
    dasharray: [1.2, 0.6],
  });

  addRailVariantLayer(map, sourceId, sourceLayers, beforeId, {
    idSuffix: 'rail-lines-monorail',
    classes: ['monorail'],
    color: '#14B8A6',
  });

  addFirstAvailableLayer(map, {
    id: `${NAV_LAYER_PREFIX}public-transport-stops`,
    type: 'circle',
    source: sourceId,
    minzoom: 11,
    filter: ['match', ['coalesce', ['get', 'class'], ['get', 'subclass']], ['station', 'railway', 'subway', 'tram_stop', 'bus_stop', 'halt', 'ferry_terminal'], true, false],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2.4, 15, 5.5, 18, 8],
      'circle-color': ['match', ['coalesce', ['get', 'class'], ['get', 'subclass']], 'subway', '#2563EB', 'tram_stop', '#F97316', 'bus_stop', '#06B6D4', '#DCE7F5'],
      'circle-stroke-color': '#0F172A',
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 16, 1.8],
      'circle-opacity': 0.92,
    },
  }, ['poi'], sourceLayers, beforeId);

  addFirstAvailableLayer(map, {
    id: `${NAV_LAYER_PREFIX}public-transport-labels`,
    type: 'symbol',
    source: sourceId,
    minzoom: 12,
    filter: ['match', ['coalesce', ['get', 'class'], ['get', 'subclass']], ['station', 'railway', 'subway', 'tram_stop', 'bus_stop', 'halt', 'ferry_terminal'], true, false],
    layout: {
      'text-field': ['coalesce', ['get', 'name'], ['get', 'name:ru'], ''],
      'text-font': ['Open Sans Bold', 'Noto Sans Regular'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10 * labelSizeMultiplier, 17, 13 * labelSizeMultiplier],
      'text-offset': [0, 1.15],
      'text-anchor': 'top',
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': '#DCE7F5',
      'text-halo-color': haloColor,
      'text-halo-width': 1.8,
    },
  }, ['poi'], sourceLayers, undefined);

  addFirstAvailableLayer(map, {
    id: `${NAV_LAYER_PREFIX}public-civic-icons`,
    type: 'circle',
    source: sourceId,
    minzoom: 12,
    filter: ['match', ['coalesce', ['get', 'class'], ['get', 'subclass']], ['museum', 'theatre', 'library', 'town_hall', 'courthouse', 'government', 'park', 'garden', 'attraction', 'viewpoint'], true, false],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 2.2, 16, 4.8],
      'circle-color': ['match', ['coalesce', ['get', 'class'], ['get', 'subclass']], 'park', '#3FA34D', 'garden', '#7CCF7B', 'museum', '#8B5CF6', 'theatre', '#EC4899', 'library', '#F59E0B', 'attraction', '#EAB308', 'viewpoint', '#22C55E', '#94A3B8'],
      'circle-stroke-color': '#0F172A',
      'circle-stroke-width': 1.2,
      'circle-opacity': 0.88,
    },
  }, ['poi'], sourceLayers, beforeId);

  addFirstAvailableLayer(map, {
    id: `${NAV_LAYER_PREFIX}public-civic-labels`,
    type: 'symbol',
    source: sourceId,
    minzoom: 13,
    filter: ['match', ['coalesce', ['get', 'class'], ['get', 'subclass']], ['museum', 'theatre', 'library', 'town_hall', 'courthouse', 'government', 'park', 'garden', 'attraction', 'viewpoint'], true, false],
    layout: {
      'text-field': ['coalesce', ['get', 'name'], ['get', 'name:ru'], ''],
      'text-font': ['Open Sans Bold', 'Noto Sans Regular'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10 * labelSizeMultiplier, 17, 13 * labelSizeMultiplier],
      'text-offset': [0, 1.05],
      'text-anchor': 'top',
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': palette.labelText,
      'text-halo-color': haloColor,
      'text-halo-width': 1.9,
    },
  }, ['poi'], sourceLayers, undefined);

  ensureNavObjectSource(map);
  addOrReplaceLayer(map, {
    id: `${NAV_LAYER_PREFIX}objects-spot`,
    type: 'circle',
    source: NAV_SOURCE_ID,
    minzoom: 11,
    paint: {
      'circle-radius': ['match', ['get', 'relevance'], 'primary', 8, 'secondary', 6, 4],
      'circle-color': [
        'match',
        ['get', 'kind'],
        'traffic_light', '#22C55E',
        'speed_camera', '#EF4444',
        'park', '#3FA34D',
        'public_transport', '#38BDF8',
        'landmark', '#EAB308',
        'public_service', '#8B5CF6',
        '#94A3B8'
      ],
      'circle-stroke-color': '#0F172A',
      'circle-stroke-width': 1.5,
      'circle-opacity': 0.88,
    },
  }, new Set([NAV_SOURCE_ID]), undefined);

  addOrReplaceLayer(map, {
    id: `${NAV_LAYER_PREFIX}objects-low`,
    type: 'symbol',
    source: NAV_SOURCE_ID,
    filter: ['==', ['get', 'relevance'], 'low'],
    minzoom: 13,
    layout: {
      'text-field': ['get', 'iconText'],
      'text-font': ['Open Sans Bold', 'Noto Sans Regular'],
      'text-size': 11,
      'text-offset': [0, 0],
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': palette.houseNumberText,
      'text-halo-color': haloColor,
      'text-halo-width': 2,
    },
  }, new Set([NAV_SOURCE_ID]), undefined);

  addOrReplaceLayer(map, {
    id: `${NAV_LAYER_PREFIX}objects-secondary`,
    type: 'symbol',
    source: NAV_SOURCE_ID,
    filter: ['==', ['get', 'relevance'], 'secondary'],
    minzoom: 12,
    layout: {
      'text-field': ['get', 'iconText'],
      'text-font': ['Open Sans Bold', 'Noto Sans Regular'],
      'text-size': 13,
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': palette.labelText,
      'text-halo-color': haloColor,
      'text-halo-width': 2.2,
    },
  }, new Set([NAV_SOURCE_ID]), undefined);

  addOrReplaceLayer(map, {
    id: `${NAV_LAYER_PREFIX}objects-primary`,
    type: 'symbol',
    source: NAV_SOURCE_ID,
    filter: ['==', ['get', 'relevance'], 'primary'],
    minzoom: 11,
    layout: {
      'text-field': ['get', 'iconText'],
      'text-font': ['Open Sans Bold', 'Noto Sans Regular'],
      'text-size': 15,
      'text-allow-overlap': true,
      'text-ignore-placement': false,
    },
    paint: {
      'text-color': [
        'match',
        ['get', 'kind'],
        'speed_camera', '#FCA5A5',
        'traffic_light', '#86EFAC',
        'park', '#BBF7D0',
        'public_transport', '#BAE6FD',
        'landmark', '#FDE68A',
        'public_service', '#DDD6FE',
        palette.labelText
      ],
      'text-halo-color': haloColor,
      'text-halo-width': 2.5,
      'text-halo-blur': 0.2,
    },
  }, new Set([NAV_SOURCE_ID]), undefined);
}

export function updateNavigationObjectSource(map: maplibregl.Map, objects: NavigationMapObject[]): void {
  ensureNavObjectSource(map);
  const source = map.getSource(NAV_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (!source) return;
  source.setData(toFeatureCollection(objects));
}

function ensureNavObjectSource(map: maplibregl.Map): void {
  if (!map.getSource(NAV_SOURCE_ID)) {
    map.addSource(NAV_SOURCE_ID, {
      type: 'geojson',
      data: toFeatureCollection([]),
    });
  }
}

function toFeatureCollection(objects: NavigationMapObject[]): FeatureCollection<Point, GeoJsonProperties> {
  return {
    type: 'FeatureCollection',
    features: objects.map<Feature<Point, GeoJsonProperties>>((object) => ({
      type: 'Feature',
      id: object.id,
      properties: {
        id: object.id,
        kind: object.kind,
        title: object.title,
        subtitle: object.subtitle,
        iconText: object.iconText,
        relevance: object.relevance,
        severity: object.severity,
        routeDistanceMeters: object.routeDistanceMeters,
      },
      geometry: {
        type: 'Point',
        coordinates: [object.location.lng, object.location.lat],
      },
    })),
  };
}

function addOrReplaceLayer(
  map: maplibregl.Map,
  layer: NavigationLayerSpec,
  sourceLayers: Set<string>,
  beforeId?: string,
): void {
  const sourceLayer = layer['source-layer'];
  if (typeof sourceLayer === 'string' && !sourceLayers.has(sourceLayer)) {
    return;
  }

  try {
    if (map.getLayer(layer.id)) {
      map.removeLayer(layer.id);
    }

    map.addLayer(layer as maplibregl.LayerSpecification, beforeId);
  } catch (error) {
    logger.warn('[navigationLayers] failed to upsert layer', {
      layerId: layer.id,
      sourceLayer,
      error,
    });
  }
}

function addFirstAvailableLayer(
  map: maplibregl.Map,
  layer: NavigationLayerSpec,
  candidateSourceLayers: string[],
  sourceLayers: Set<string>,
  beforeId?: string,
): void {
  const match = candidateSourceLayers.find((sourceLayer) => sourceLayers.has(sourceLayer));
  if (!match) return;
  addOrReplaceLayer(map, { ...layer, 'source-layer': match }, sourceLayers, beforeId);
}

function addRailVariantLayer(
  map: maplibregl.Map,
  sourceId: string,
  sourceLayers: Set<string>,
  beforeId: string | undefined,
  options: {
    idSuffix: string;
    classes: string[];
    color: string;
    dasharray?: number[];
  },
): void {
  addFirstAvailableLayer(map, {
    id: `${NAV_LAYER_PREFIX}${options.idSuffix}`,
    type: 'line',
    source: sourceId,
    minzoom: 9,
    filter: ['match', ['coalesce', ['get', 'class'], ['get', 'subclass']], options.classes, true, false],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': options.color,
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.8, 15, 2.2, 18, 3.4],
      'line-opacity': 0.92,
      ...(options.dasharray ? { 'line-dasharray': options.dasharray } : {}),
    },
  }, ['transportation'], sourceLayers, beforeId);
}

function findVectorSourceId(style: maplibregl.StyleSpecification): string | null {
  return Object.entries(style.sources ?? {}).find(([, source]) => source.type === 'vector')?.[0] ?? null;
}

function getSourceLayers(style: maplibregl.StyleSpecification, sourceId: string): Set<string> {
  return new Set(
    (style.layers ?? [])
      .filter((layer) => {
        const typedLayer = layer as NavigationLayerSpec;
        return typedLayer.source === sourceId && typeof typedLayer['source-layer'] === 'string';
      })
      .map((layer) => (layer as NavigationLayerSpec)['source-layer'] as string),
  );
}

function findFirstSymbolLayerId(style: maplibregl.StyleSpecification): string | undefined {
  return style.layers?.find((layer) => layer.type === 'symbol')?.id;
}
