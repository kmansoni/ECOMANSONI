import type maplibregl from 'maplibre-gl';
import { getMapLabelTextFieldExpression } from '@/lib/localization/appLocale';

export type ProductionMapMode =
  | 'dark'
  | 'light'
  | 'satellite'
  | 'hybrid'
  | 'terrain'
  | 'streets'
  | 'voyager'
  | 'positron'
  | 'darkNolabels';

export interface ProductionPalette {
  background: string;
  motorwayRoad: string;
  trunkRoad: string;
  primaryRoad: string;
  secondaryRoad: string;
  localRoad: string;
  serviceRoad: string;
  roadCasing: string;
  tunnelCasing: string;
  centerLine: string;
  shieldText: string;
  waterFill: string;
  waterLine: string;
  waterwayLine: string;
  parkFill: string;
  parkOutline: string;
  buildingFill: string;
  buildingLine: string;
  roadLabelText: string;
  labelText: string;
  labelHalo: string;
  houseNumberText: string;
  houseNumberHalo: string;
  speedLabelText: string;
  speedLabelHalo: string;
  buildingExtrusionStops: Array<[number, string]>;
}

function normalizeMode(mode: ProductionMapMode): 'dark' | 'light' | 'satellite' | 'hybrid' | 'terrain' | 'streets' {
  if (mode === 'voyager' || mode === 'positron') return 'light';
  if (mode === 'darkNolabels') return 'dark';
  return mode;
}

export function getProductionPalette(mode: ProductionMapMode): ProductionPalette {
  switch (normalizeMode(mode)) {
    case 'light':
      return {
        background: '#F5F7FA',
        motorwayRoad: '#F59E0B',
        trunkRoad: '#F7B84B',
        primaryRoad: '#FFFFFF',
        secondaryRoad: '#F8FAFC',
        localRoad: '#EDF2F7',
        serviceRoad: '#E2E8F0',
        roadCasing: 'rgba(148, 163, 184, 0.92)',
        tunnelCasing: 'rgba(148, 163, 184, 0.56)',
        centerLine: '#F59E0B',
        shieldText: '#0F172A',
        waterFill: '#BFDBFE',
        waterLine: '#60A5FA',
        waterwayLine: '#3B82F6',
        parkFill: 'rgba(187, 247, 208, 0.72)',
        parkOutline: 'rgba(74, 222, 128, 0.36)',
        buildingFill: 'rgba(226, 232, 240, 0.86)',
        buildingLine: 'rgba(148, 163, 184, 0.95)',
        roadLabelText: '#0F172A',
        labelText: '#1E293B',
        labelHalo: 'rgba(255, 255, 255, 0.98)',
        houseNumberText: '#334155',
        houseNumberHalo: 'rgba(255, 255, 255, 0.95)',
        speedLabelText: '#DC2626',
        speedLabelHalo: 'rgba(255, 255, 255, 0.96)',
        buildingExtrusionStops: [
          [0, '#E2E8F0'],
          [40, '#CBD5E1'],
          [100, '#94A3B8'],
          [200, '#64748B'],
        ],
      };
    case 'terrain':
      return {
        background: '#EEF2E7',
        motorwayRoad: '#D97706',
        trunkRoad: '#E59C3E',
        primaryRoad: '#FFFDF7',
        secondaryRoad: '#F5F5F0',
        localRoad: '#EDE7DB',
        serviceRoad: '#DDD6C7',
        roadCasing: 'rgba(120, 113, 108, 0.86)',
        tunnelCasing: 'rgba(120, 113, 108, 0.52)',
        centerLine: '#FACC15',
        shieldText: '#1C1917',
        waterFill: '#93C5FD',
        waterLine: '#3B82F6',
        waterwayLine: '#2563EB',
        parkFill: 'rgba(145, 204, 117, 0.58)',
        parkOutline: 'rgba(74, 124, 52, 0.32)',
        buildingFill: 'rgba(214, 211, 209, 0.84)',
        buildingLine: 'rgba(120, 113, 108, 0.9)',
        roadLabelText: '#292524',
        labelText: '#292524',
        labelHalo: 'rgba(250, 250, 249, 0.94)',
        houseNumberText: '#44403C',
        houseNumberHalo: 'rgba(255, 251, 235, 0.9)',
        speedLabelText: '#B91C1C',
        speedLabelHalo: 'rgba(255, 251, 235, 0.95)',
        buildingExtrusionStops: [
          [0, '#D6D3D1'],
          [40, '#BFAE9C'],
          [100, '#A58C73'],
          [200, '#8B6B4F'],
        ],
      };
    case 'satellite':
    case 'hybrid':
      return {
        background: '#0B0F14',
        motorwayRoad: '#F8FAFC',
        trunkRoad: '#F1F5F9',
        primaryRoad: '#E2E8F0',
        secondaryRoad: '#CBD5E1',
        localRoad: '#CBD5E1',
        serviceRoad: '#94A3B8',
        roadCasing: 'rgba(2, 6, 23, 0.92)',
        tunnelCasing: 'rgba(30, 41, 59, 0.65)',
        centerLine: '#FACC15',
        shieldText: '#F8FAFC',
        waterFill: '#0C4A6E',
        waterLine: '#38BDF8',
        waterwayLine: '#7DD3FC',
        parkFill: 'rgba(20, 83, 45, 0.28)',
        parkOutline: 'rgba(74, 222, 128, 0.18)',
        buildingFill: 'rgba(15, 23, 42, 0.18)',
        buildingLine: 'rgba(248, 250, 252, 0.42)',
        roadLabelText: '#FFFFFF',
        labelText: '#F8FAFC',
        labelHalo: 'rgba(2, 6, 23, 0.96)',
        houseNumberText: '#E2E8F0',
        houseNumberHalo: 'rgba(2, 6, 23, 0.95)',
        speedLabelText: '#F87171',
        speedLabelHalo: 'rgba(2, 6, 23, 0.92)',
        buildingExtrusionStops: [
          [0, '#475569'],
          [40, '#64748B'],
          [100, '#94A3B8'],
          [200, '#CBD5E1'],
        ],
      };
    case 'streets':
      return {
        background: '#F3F4F6',
        motorwayRoad: '#F59E0B',
        trunkRoad: '#FBBF24',
        primaryRoad: '#FFFFFF',
        secondaryRoad: '#F9FAFB',
        localRoad: '#EEF2F7',
        serviceRoad: '#E5E7EB',
        roadCasing: 'rgba(100, 116, 139, 0.82)',
        tunnelCasing: 'rgba(100, 116, 139, 0.5)',
        centerLine: '#F59E0B',
        shieldText: '#111827',
        waterFill: '#BFDBFE',
        waterLine: '#60A5FA',
        waterwayLine: '#3B82F6',
        parkFill: 'rgba(187, 247, 208, 0.64)',
        parkOutline: 'rgba(34, 197, 94, 0.28)',
        buildingFill: 'rgba(229, 231, 235, 0.88)',
        buildingLine: 'rgba(156, 163, 175, 0.9)',
        roadLabelText: '#0F172A',
        labelText: '#1F2937',
        labelHalo: 'rgba(255, 255, 255, 0.96)',
        houseNumberText: '#4B5563',
        houseNumberHalo: 'rgba(255, 255, 255, 0.92)',
        speedLabelText: '#DC2626',
        speedLabelHalo: 'rgba(255, 255, 255, 0.95)',
        buildingExtrusionStops: [
          [0, '#E5E7EB'],
          [40, '#CBD5E1'],
          [100, '#9CA3AF'],
          [200, '#6B7280'],
        ],
      };
    case 'dark':
    default:
      return {
        background: '#0D1117',
        motorwayRoad: '#F59E0B',
        trunkRoad: '#F7B955',
        primaryRoad: '#F8FAFC',
        secondaryRoad: '#CBD5E1',
        localRoad: '#AAB6C5',
        serviceRoad: '#6B7280',
        roadCasing: 'rgba(15, 23, 42, 0.9)',
        tunnelCasing: 'rgba(71, 85, 105, 0.5)',
        centerLine: '#FDE68A',
        shieldText: '#F8FAFC',
        waterFill: '#0C4A6E',
        waterLine: '#0EA5E9',
        waterwayLine: '#67E8F9',
        parkFill: 'rgba(20, 83, 45, 0.58)',
        parkOutline: 'rgba(74, 222, 128, 0.18)',
        buildingFill: 'rgba(30, 41, 59, 0.88)',
        buildingLine: 'rgba(100, 116, 139, 0.95)',
        roadLabelText: '#F8FAFC',
        labelText: '#E2E8F0',
        labelHalo: 'rgba(2, 6, 23, 0.96)',
        houseNumberText: '#CBD5E1',
        houseNumberHalo: 'rgba(2, 6, 23, 0.92)',
        speedLabelText: '#F87171',
        speedLabelHalo: 'rgba(15, 23, 42, 0.92)',
        buildingExtrusionStops: [
          [0, '#1E293B'],
          [40, '#334155'],
          [100, '#475569'],
          [200, '#64748B'],
        ],
      };
  }
}

export function getBuildingExtrusionColorExpression(mode: ProductionMapMode): maplibregl.ExpressionSpecification {
  const stops = getProductionPalette(mode).buildingExtrusionStops;
  return [
    'interpolate', ['linear'], ['coalesce', ['get', 'render_height'], ['get', 'height'], 10],
    stops[0][0], stops[0][1],
    stops[1][0], stops[1][1],
    stops[2][0], stops[2][1],
    stops[3][0], stops[3][1],
  ];
}

export function applyProductionStyleEnhancements(map: maplibregl.Map, mode: ProductionMapMode, languageCode?: string | null): void {
  const style = map.getStyle();
  if (!style?.layers?.length) return;

  const palette = getProductionPalette(mode);
  const backgroundLayer = style.layers.find((layer) => layer.type === 'background');
  if (backgroundLayer) {
    try {
      map.setPaintProperty(backgroundLayer.id, 'background-color', palette.background);
    } catch {
      // Ignore styles without mutable background paint.
    }
  }

  localizeAndSharpenLabels(map, mode, languageCode);
  applyOverlayLayers(map, mode);
}

function localizeAndSharpenLabels(map: maplibregl.Map, mode: ProductionMapMode, languageCode?: string | null): void {
  const style = map.getStyle();
  if (!style?.layers) return;

  const palette = getProductionPalette(mode);
  const textFieldExpression = getMapLabelTextFieldExpression(languageCode);
  for (const layer of style.layers) {
    if (layer.type !== 'symbol') continue;
    if (layer.id.startsWith('nav-layer-') || layer.id.startsWith('enhanced-') || layer.id.startsWith('route-seg-')) continue;

    const layerLayout = (layer as maplibregl.SymbolLayerSpecification).layout;
    if (!layerLayout?.['text-field']) continue;

    const sourceLayer = (layer as maplibregl.SymbolLayerSpecification)['source-layer'] ?? '';
    const lowerId = layer.id.toLowerCase();
    const isShield = lowerId.includes('shield') || lowerId.includes('ref');
    const isHouseNumber = sourceLayer === 'housenumber' || lowerId.includes('house');

    try {
      map.setLayoutProperty(layer.id, 'text-font', ['Noto Sans Bold', 'Noto Sans Regular', 'Open Sans Bold']);
    } catch {
      // Ignore symbol layers without text-font support.
    }

    if (!isShield && !isHouseNumber) {
      try {
        map.setLayoutProperty(layer.id, 'text-field', textFieldExpression);
      } catch {
        // Preserve provider-specific expressions when not supported.
      }
    }

    try {
      map.setPaintProperty(layer.id, 'text-color', isHouseNumber ? palette.houseNumberText : palette.labelText);
      map.setPaintProperty(layer.id, 'text-halo-color', isHouseNumber ? palette.houseNumberHalo : palette.labelHalo);
      map.setPaintProperty(layer.id, 'text-halo-width', isHouseNumber ? 1.6 : 2.4);
      map.setPaintProperty(layer.id, 'text-halo-blur', 0);
    } catch {
      // Some provider layers are image-only symbols.
    }
  }
}

function applyOverlayLayers(map: maplibregl.Map, mode: ProductionMapMode): void {
  const style = map.getStyle();
  if (!style?.sources) return;

  const sourceId = Object.entries(style.sources).find(([, source]) => source.type === 'vector')?.[0];
  if (!sourceId) return;

  const sourceLayers = new Set(
    (style.layers ?? [])
      .filter((layer) => (layer as maplibregl.LayerSpecification & { source?: string }).source === sourceId)
      .map((layer) => (layer as maplibregl.LayerSpecification & { 'source-layer'?: string })['source-layer'])
      .filter((value): value is string => typeof value === 'string'),
  );

  const beforeId = style.layers.find((layer) => layer.type === 'symbol')?.id;
  const palette = getProductionPalette(mode);

  addOrReplaceLayer(map, {
    id: 'mansoni-water-fill',
    type: 'fill',
    source: sourceId,
    'source-layer': 'water',
    paint: {
      'fill-color': palette.waterFill,
      'fill-opacity': normalizeMode(mode) === 'satellite' ? 0.58 : 0.88,
    },
  }, sourceLayers, beforeId);

  addOrReplaceLayer(map, {
    id: 'mansoni-water-outline',
    type: 'line',
    source: sourceId,
    'source-layer': 'water',
    paint: {
      'line-color': palette.waterLine,
      'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.4, 12, 1.2, 18, 2.4],
      'line-opacity': 0.72,
    },
  }, sourceLayers, beforeId);

  addOrReplaceLayer(map, {
    id: 'mansoni-waterway-line',
    type: 'line',
    source: sourceId,
    'source-layer': 'waterway',
    paint: {
      'line-color': palette.waterwayLine,
      'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.5, 12, 1.5, 18, 4.5],
      'line-opacity': 0.84,
    },
  }, sourceLayers, beforeId);

  const greenSourceLayer = sourceLayers.has('landcover') ? 'landcover' : 'landuse';
  addOrReplaceLayer(map, {
    id: 'mansoni-green-fill',
    type: 'fill',
    source: sourceId,
    'source-layer': greenSourceLayer,
    filter: ['match', ['coalesce', ['get', 'class'], ['get', 'subclass']], ['park', 'forest', 'wood', 'grass', 'garden', 'recreation_ground'], true, false],
    paint: {
      'fill-color': palette.parkFill,
      'fill-opacity': 1,
    },
  }, sourceLayers, beforeId);

  addOrReplaceLayer(map, {
    id: 'mansoni-green-outline',
    type: 'line',
    source: sourceId,
    'source-layer': greenSourceLayer,
    filter: ['match', ['coalesce', ['get', 'class'], ['get', 'subclass']], ['park', 'forest', 'wood', 'grass', 'garden', 'recreation_ground'], true, false],
    paint: {
      'line-color': palette.parkOutline,
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.3, 14, 0.8, 18, 1.2],
      'line-opacity': 0.9,
    },
  }, sourceLayers, beforeId);

  addOrReplaceLayer(map, {
    id: 'mansoni-building-footprint',
    type: 'fill',
    source: sourceId,
    'source-layer': 'building',
    minzoom: 13,
    paint: {
      'fill-color': palette.buildingFill,
      'fill-opacity': normalizeMode(mode) === 'satellite' ? 0.08 : 0.38,
      'fill-outline-color': palette.buildingLine,
    },
  }, sourceLayers, beforeId);
}

function addOrReplaceLayer(
  map: maplibregl.Map,
  layer: maplibregl.LayerSpecification & { id: string; source?: string; 'source-layer'?: string },
  sourceLayers: Set<string>,
  beforeId?: string,
): void {
  const sourceLayer = layer['source-layer'];
  if (typeof sourceLayer === 'string' && !sourceLayers.has(sourceLayer)) return;

  if (map.getLayer(layer.id)) {
    map.removeLayer(layer.id);
  }

  map.addLayer(layer, beforeId);
}