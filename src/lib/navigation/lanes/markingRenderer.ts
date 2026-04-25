/**
 * Marking Renderer — генерирует геометрию разметки между HD-полосами.
 *
 * Правила (по ПДД РФ + общая практика):
 *   - Между встречными → двойная сплошная (или одинарная если узкая дорога)
 *   - Между попутными, change=yes → прерывистая
 *   - Между попутными, change=not_left → сплошная слева
 *   - Перед перекрёстком (≤20m) → стоп-линия
 *   - Велополоса → белая прерывистая + цветная заливка (рендерится отдельно)
 *   - Автобусная (busway) → одинарная жёлтая сплошная
 */

import type { HDLane, LaneMarking, LaneMarkingType } from '@/types/roadInfra';
import type { LatLng } from '@/types/taxi';

interface MarkingContext {
  /** Сколько полос идёт в forward направлении */
  forwardLanes: number;
  /** Сколько в backward (если двусторонняя) */
  backwardLanes: number;
  /** Узкая дорога (residential, ≤6m общей ширины) → одинарная вместо двойной */
  isNarrow?: boolean;
  /** Расстояние до перекрёстка в метрах (для стоп-линии) */
  intersectionDistanceM?: number | null;
}

/**
 * Главная функция: на основе полос строит набор разметочных линий.
 * Полосы должны быть отсортированы по index слева направо.
 */
export function buildMarkingsForLaneGroup(
  lanes: HDLane[],
  ctx: MarkingContext
): LaneMarking[] {
  if (lanes.length < 1) return [];

  const sorted = [...lanes].sort((a, b) => a.index - b.index);
  const markings: LaneMarking[] = [];

  // Разметка между i-1 и i (для i=1..N-1)
  for (let i = 1; i < sorted.length; i++) {
    const left = sorted[i - 1];
    const right = sorted[i];
    const type = pickMarkingType(left, right, i, sorted, ctx);
    if (!type) continue;

    markings.push({
      betweenIndices: [left.index, right.index],
      type,
      geometry: averagePolyline(left.rightEdge, right.leftEdge),
    });
  }

  // Стоп-линия перед перекрёстком
  if (ctx.intersectionDistanceM != null && ctx.intersectionDistanceM <= 20) {
    const stopLine = buildStopLine(sorted);
    if (stopLine) markings.push(stopLine);
  }

  return markings;
}

function pickMarkingType(
  left: HDLane,
  right: HDLane,
  rightIndex: number,
  allLanes: HDLane[],
  ctx: MarkingContext
): LaneMarkingType | null {
  // Граница встречки: forward к backward
  // Считаем: первые ctx.forwardLanes — forward, оставшиеся — backward
  const isOpposingBoundary = ctx.backwardLanes > 0 && rightIndex === ctx.forwardLanes;
  if (isOpposingBoundary) {
    return ctx.isNarrow ? 'solid_yellow' : 'solid_double_white';
  }

  // Автобусная полоса
  if (left.type === 'bus' || right.type === 'bus') {
    return 'solid_yellow';
  }

  // Велополоса
  if (left.type === 'bike' || right.type === 'bike') {
    return 'dashed_white';
  }

  // Парковка
  if (left.type === 'parking' || right.type === 'parking') {
    return 'solid_white';
  }

  // Перестрой
  const canChangeBetween = left.canChangeRight && right.canChangeLeft;
  if (canChangeBetween) return 'dashed_white';

  // Один сторонний запрет → mixed
  if (left.canChangeRight && !right.canChangeLeft) return 'mixed_left_solid';
  if (!left.canChangeRight && right.canChangeLeft) return 'mixed_right_solid';

  return 'solid_white';
}

/**
 * Стоп-линия: поперечная белая полоса перед перекрёстком,
 * соединяющая левый край самой левой полосы с правым краем самой правой.
 */
function buildStopLine(lanes: HDLane[]): LaneMarking | null {
  const first = lanes[0];
  const last = lanes[lanes.length - 1];
  if (!first || !last) return null;

  // Берём последние точки полос (наиболее близкие к перекрёстку)
  const leftEnd = first.leftEdge[first.leftEdge.length - 1];
  const rightEnd = last.rightEdge[last.rightEdge.length - 1];
  if (!leftEnd || !rightEnd) return null;

  return {
    betweenIndices: [-1, lanes.length],
    type: 'stop_line',
    geometry: [leftEnd, rightEnd],
    color: '#ffffff',
  };
}

/**
 * Средняя линия между двумя полилиниями (для разметки на стыке полос).
 * Если длины разные — выравниваем по минимуму.
 */
function averagePolyline(a: LatLng[], b: LatLng[]): LatLng[] {
  const n = Math.min(a.length, b.length);
  const result: LatLng[] = [];
  for (let i = 0; i < n; i++) {
    result.push({
      lat: (a[i].lat + b[i].lat) / 2,
      lng: (a[i].lng + b[i].lng) / 2,
    });
  }
  return result;
}

/**
 * Параметры рендеринга разметки в Three.js / MapLibre line-dasharray.
 */
export interface MarkingRenderSpec {
  color: string;
  /** [dashLength, gapLength] в метрах. null = solid */
  dashPattern: [number, number] | null;
  /** Ширина линии в метрах */
  widthM: number;
  /** Двойная линия → 2 параллельные с offset */
  isDouble: boolean;
}

const SPECS: Record<LaneMarkingType, MarkingRenderSpec> = {
  solid_white:        { color: '#ffffff', dashPattern: null, widthM: 0.15, isDouble: false },
  solid_double_white: { color: '#ffffff', dashPattern: null, widthM: 0.15, isDouble: true },
  solid_yellow:       { color: '#ffd54f', dashPattern: null, widthM: 0.15, isDouble: false },
  solid_double_yellow:{ color: '#ffd54f', dashPattern: null, widthM: 0.15, isDouble: true },
  dashed_white:       { color: '#ffffff', dashPattern: [3, 3], widthM: 0.15, isDouble: false },
  dashed_yellow:      { color: '#ffd54f', dashPattern: [3, 3], widthM: 0.15, isDouble: false },
  dashed_long:        { color: '#ffffff', dashPattern: [6, 2], widthM: 0.20, isDouble: false },
  stop_line:          { color: '#ffffff', dashPattern: null, widthM: 0.40, isDouble: false },
  crosswalk:          { color: '#ffffff', dashPattern: [0.5, 0.5], widthM: 0.50, isDouble: false },
  mixed_left_solid:   { color: '#ffffff', dashPattern: [3, 3], widthM: 0.15, isDouble: true },
  mixed_right_solid:  { color: '#ffffff', dashPattern: [3, 3], widthM: 0.15, isDouble: true },
};

export function getMarkingSpec(type: LaneMarkingType): MarkingRenderSpec {
  return SPECS[type];
}
