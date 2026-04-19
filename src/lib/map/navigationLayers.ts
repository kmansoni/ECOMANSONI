import type maplibregl from 'maplibre-gl';
import type { Feature, FeatureCollection, GeoJsonProperties, Point } from 'geojson';
import type { NavigationMapObject } from '@/types/navigation';

const NAV_SOURCE_ID = 'nav-objects-source';
const NAV_LAYER_PREFIX = 'nav-layer-';

interface EnsureNavigationLayersOptions {
  labelSizeMultiplier?: number;
  highContrast?: boolean;
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
  const haloColor = options.highContrast ? 'rgba(15, 23, 42, 0.96)' : 'rgba(15, 23, 42, 0.86)';

  addOrReplaceLayer(map, {
    id: `${NAV_LAYER_PREFIX}road-casing`,
    type: 'line',
    source: sourceId,
    'source-layer': 'transportation',
    filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'street', 'service'], true, false],
    minzoom: 8,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['case', ['==', ['get', 'brunnel'], 'tunnel'], 'rgba(72, 85, 99, 0.45)', 'rgba(15, 23, 42, 0.82)'],
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
          ['==', ['get', 'class'], 'motorway'], '#60A5FA',
          ['==', ['get', 'class'], 'trunk'], '#38BDF8',
          ['==', ['get', 'class'], 'primary'], '#67E8F9',
          ['==', ['get', 'class'], 'secondary'], '#A5F3FC',
          ['==', ['get', 'class'], 'service'], '#D6D3D1',
          '#E2E8F0',
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
    id: `${NAV_LAYER_PREFIX}centerline`,
    type: 'line',
    source: sourceId,
    'source-layer': 'transportation',
    filter: ['all', ['match', ['get', 'class'], ['primary', 'secondary', 'tertiary'], true, false], ['!=', ['coalesce', ['get', 'oneway'], 0], 1]],
    minzoom: 12,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#FDE68A',
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
      'line-color': 'rgba(248, 250, 252, 0.9)',
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
      'line-color': 'rgba(148, 163, 184, 0.85)',
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
      'text-font': ['Noto Sans Bold'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 9, 9 * labelSizeMultiplier, 15, 12 * labelSizeMultiplier],
      'text-padding': 2,
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': '#F8FAFC',
      'text-halo-color': haloColor,
      'text-halo-width': 2,
      'text-halo-blur': 0.3,
    },
  }, sourceLayers, undefined);

  ensureNavObjectSource(map);
  addOrReplaceLayer(map, {
    id: `${NAV_LAYER_PREFIX}objects-low`,
    type: 'symbol',
    source: NAV_SOURCE_ID,
    filter: ['==', ['get', 'relevance'], 'low'],
    minzoom: 13,
    layout: {
      'text-field': ['get', 'iconText'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 11,
      'text-offset': [0, 0],
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': '#CBD5E1',
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
      'text-font': ['Noto Sans Bold'],
      'text-size': 13,
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': '#F8FAFC',
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
      'text-font': ['Noto Sans Bold'],
      'text-size': 15,
      'text-allow-overlap': true,
      'text-ignore-placement': false,
    },
    paint: {
      'text-color': ['case', ['==', ['get', 'kind'], 'speed_camera'], '#FCA5A5', '#F8FAFC'],
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

  if (map.getLayer(layer.id)) {
    map.removeLayer(layer.id);
  }

  map.addLayer(layer as maplibregl.LayerSpecification, beforeId);
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
