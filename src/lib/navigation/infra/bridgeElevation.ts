/**
 * Расчёт высот мостов и эстакад.
 *
 * OSM не всегда содержит абсолютную высоту, но даёт `layer=N`.
 * Эвристика:
 *   layer=1 → 5m (одноуровневая эстакада)
 *   layer=2 → 10m (двухуровневая)
 *   layer=3 → 15m (трёхуровневая развязка)
 *   layer=-1 → -5m (тоннель неглубокий)
 *   layer=-2 → -12m (метро/глубокий)
 *
 * Если есть тег `height=*` → используем его.
 * Если есть `min_height=*` → клиренс под мостом.
 */

import type { BridgeGeometry, TunnelGeometry } from '@/types/roadInfra';
import type { LatLng } from '@/types/taxi';

const LAYER_TO_METERS: Record<number, number> = {
  3: 15,
  2: 10,
  1: 5,
  0: 0,
  '-1': -5,
  '-2': -12,
  '-3': -20,
};

export function elevationFromLayer(layer: number): number {
  if (layer in LAYER_TO_METERS) return LAYER_TO_METERS[layer]!;
  // Линейная экстраполяция для крайних значений
  return layer * 5;
}

/**
 * Возвращает высоту в метрах для точки на мосту.
 * Линейно интерполирует от 0 в начале/конце моста до максимума в середине
 * (для коротких мостов <50m оставляет константную высоту).
 */
export function bridgeHeightAtPoint(
  bridge: BridgeGeometry,
  point: LatLng
): number {
  const baseHeight = bridge.heightM;
  if (bridge.lengthM < 50) return baseHeight;

  // Найти ближайшую точку и относительную позицию
  let minDist = Infinity;
  let nearestIdx = 0;
  for (let i = 0; i < bridge.geometry.length; i++) {
    const p = bridge.geometry[i];
    const dist = haversineMeters(p, point);
    if (dist < minDist) {
      minDist = dist;
      nearestIdx = i;
    }
  }

  // Относительная позиция вдоль моста (0..1)
  const relPos = nearestIdx / Math.max(1, bridge.geometry.length - 1);
  // Параболический профиль: 0 на концах, max в середине
  const profile = 1 - Math.pow(2 * relPos - 1, 2);
  // Минимум 30% от полной высоты на концах для плавного въезда
  return baseHeight * (0.3 + 0.7 * profile);
}

/**
 * Глубина тоннеля в точке. Аналогично мосту, но отрицательное значение.
 */
export function tunnelDepthAtPoint(
  tunnel: TunnelGeometry,
  point: LatLng
): number {
  // Тоннель — постоянная глубина по всей длине, въезды/выезды короткие
  return Math.min(0, tunnel.layer * 5);
}

/**
 * Сортирует мосты по слою (нижние первые) для корректного z-порядка рендера.
 */
export function sortBridgesByLayer(bridges: BridgeGeometry[]): BridgeGeometry[] {
  return [...bridges].sort((a, b) => a.layer - b.layer);
}

function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const aH =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(aH)));
}
