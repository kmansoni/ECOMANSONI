/**
 * POI Visibility Manager — скрывает иконки и названия POI в HD-режиме.
 *
 * Когда включается HD 3D-режим, точки и подписи (музеи, рестораны, остановки и т.д.)
 * мешают восприятию дорожной инфраструктуры. Скрываем их через `setLayoutProperty
 * (..., 'visibility', 'none')` и восстанавливаем оригинальное значение при выходе.
 *
 * Какие слои скрываем:
 *   - Стилевые `poi`, `poi_label`, `poi-label*`, `place-*` (MapTiler/CartoDB)
 *   - Наши `nav-layer-public-transport-*`, `nav-layer-public-civic-*`
 *   - Подписи мест (place_label, label_*)
 *
 * Дороги, мосты, маршрут — НЕ трогаем.
 */

import type maplibregl from 'maplibre-gl';
import { logger } from '@/lib/logger';

const HIDE_PATTERNS: RegExp[] = [
  /^poi(_|-|$)/i,
  /^place(_|-)label/i,
  /^place-/i,
  /poi[-_]?label/i,
  /^label_(place|poi)/i,
  /transit[-_](label|station)/i,
  // Наши civic / public-transport
  /^nav-layer-public-civic/i,
  /^nav-layer-public-transport-(stops|labels)/i,
];

const STORAGE_KEY = '__mansoni_hd_hidden_layers';

interface SavedVisibility {
  id: string;
  prev: 'visible' | 'none' | undefined;
}

interface MapWithStorage extends maplibregl.Map {
  [STORAGE_KEY]?: SavedVisibility[];
}

/**
 * Скрыть POI/labels слои. Сохраняет предыдущее состояние для restore.
 */
export function hidePoiLayers(map: maplibregl.Map): void {
  const m = map as MapWithStorage;
  if (m[STORAGE_KEY]) return; // уже скрыто

  const style = map.getStyle();
  if (!style?.layers) return;

  const saved: SavedVisibility[] = [];

  for (const layer of style.layers) {
    if (!shouldHide(layer.id)) continue;
    try {
      const prev = (map.getLayoutProperty(layer.id, 'visibility') as 'visible' | 'none' | undefined);
      saved.push({ id: layer.id, prev });
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    } catch (err) {
      logger.debug('[poiVisibility] не удалось скрыть слой', layer.id, err);
    }
  }

  m[STORAGE_KEY] = saved;
}

/**
 * Восстановить видимость POI/labels.
 */
export function restorePoiLayers(map: maplibregl.Map): void {
  const m = map as MapWithStorage;
  const saved = m[STORAGE_KEY];
  if (!saved) return;

  for (const entry of saved) {
    try {
      // Если оригинал был undefined — это default 'visible'
      map.setLayoutProperty(entry.id, 'visibility', entry.prev ?? 'visible');
    } catch (err) {
      logger.debug('[poiVisibility] не удалось восстановить слой', entry.id, err);
    }
  }

  delete m[STORAGE_KEY];
}

function shouldHide(layerId: string): boolean {
  return HIDE_PATTERNS.some((re) => re.test(layerId));
}
