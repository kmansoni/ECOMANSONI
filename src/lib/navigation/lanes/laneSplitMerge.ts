/**
 * Lane Split / Merge handler — обработка развязок и съездов.
 *
 * Сценарии:
 *   1. Съезд с магистрали (motorway_link)  — постепенное сужение полосы → 0
 *   2. Слияние двух дорог (merge)           — две полосы сходятся в одну
 *   3. Кольцевая (junction=roundabout)      — концентрические полосы
 *   4. Перекрёсток X                        — прерывание полос за 5м до центра
 *
 * Возвращает HDLane[] с обновлённой геометрией (сужение в зоне разделения).
 */

import type { HDLane, LaneArrow } from '@/types/roadInfra';
import type { LatLng } from '@/types/taxi';

interface SplitMergeContext {
  /** Точка разделения (junction node, lat/lng) */
  junctionPoint: LatLng;
  /** Тип события: split = от одной полосы откалывается, merge = две сливаются */
  kind: 'split' | 'merge';
  /** Индекс полосы, которая отделяется/прибывает */
  affectedLaneIndex: number;
  /** Длина переходной зоны, м (default 30) */
  transitionMeters?: number;
}

/**
 * Сужает указанную полосу от полной ширины до 0.5м к точке junction.
 * Применяется к концевой части полосы (последние transitionMeters).
 */
export function applyLaneSplit(
  lanes: HDLane[],
  ctx: SplitMergeContext
): HDLane[] {
  const transitionM = ctx.transitionMeters ?? 30;
  return lanes.map((lane) => {
    if (lane.index !== ctx.affectedLaneIndex) return lane;

    // Найти точку на centerline ближайшую к junction
    const { idx: junctionIdx } = nearestPoint(lane.centerline, ctx.junctionPoint);
    if (junctionIdx < 0) return lane;

    // Идём от junction назад по полосе на transitionM метров
    const startIdx = walkBackByDistance(lane.centerline, junctionIdx, transitionM);

    // Линейно сужаем halfWidth от 0.5 до lane.widthMeters/2
    const newLeft: LatLng[] = [...lane.leftEdge];
    const newRight: LatLng[] = [...lane.rightEdge];
    const segLen = Math.max(1, junctionIdx - startIdx);

    for (let i = startIdx; i <= junctionIdx; i++) {
      const t = (i - startIdx) / segLen; // 0..1
      const halfFactor = 1 - 0.85 * t; // от 1 до 0.15
      const center = lane.centerline[i];
      const orig = {
        l: lane.leftEdge[i],
        r: lane.rightEdge[i],
      };
      newLeft[i] = lerpLatLng(center, orig.l, halfFactor);
      newRight[i] = lerpLatLng(center, orig.r, halfFactor);
    }

    return { ...lane, leftEdge: newLeft, rightEdge: newRight };
  });
}

/**
 * Detection: находит съезды/слияния по тегам полосы (turn:lanes contains merge_to_*).
 * Возвращает контексты для применения applyLaneSplit.
 */
export function detectSplitsFromTurns(lanes: HDLane[]): SplitMergeContext[] {
  const contexts: SplitMergeContext[] = [];
  for (const lane of lanes) {
    const hasMerge = lane.allowedTurns.some(
      (t) => t === 'merge_to_left' || t === 'merge_to_right'
    );
    if (!hasMerge) continue;
    // Точка разделения = конец полосы
    const junctionPoint = lane.centerline[lane.centerline.length - 1];
    if (!junctionPoint) continue;
    contexts.push({
      junctionPoint,
      kind: 'merge',
      affectedLaneIndex: lane.index,
    });
  }
  return contexts;
}

/**
 * Стрелки направлений на полосах (из turn:lanes).
 * Стрелка рисуется ~30м до конца полосы (перед перекрёстком).
 */
export function buildArrowsForLanes(lanes: HDLane[], distanceFromEndM = 30): LaneArrow[] {
  const arrows: LaneArrow[] = [];
  for (const lane of lanes) {
    if (lane.centerline.length < 2) continue;
    const endIdx = lane.centerline.length - 1;
    const arrowIdx = walkBackByDistance(lane.centerline, endIdx, distanceFromEndM);
    const position = lane.centerline[arrowIdx];
    if (!position) continue;

    // Tangent для определения rotation
    const tangentEnd = lane.centerline[Math.min(endIdx, arrowIdx + 1)];
    const tangentStart = lane.centerline[Math.max(0, arrowIdx - 1)];
    const dx = (tangentEnd.lng - tangentStart.lng);
    const dy = (tangentEnd.lat - tangentStart.lat);
    const rotationDeg = (Math.atan2(dx, dy) * 180) / Math.PI;

    for (const dir of lane.allowedTurns) {
      arrows.push({
        position,
        direction: dir,
        laneIndex: lane.index,
        rotationDeg,
      });
    }
  }
  return arrows;
}

// ─── helpers ─────────────────────────────────────────────────────────────

function lerpLatLng(a: LatLng, b: LatLng, t: number): LatLng {
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  };
}

function nearestPoint(line: LatLng[], target: LatLng): { idx: number; distM: number } {
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < line.length; i++) {
    const d = haversineMeters(line[i], target);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return { idx: bestIdx, distM: bestDist };
}

function walkBackByDistance(line: LatLng[], fromIdx: number, distanceM: number): number {
  let acc = 0;
  for (let i = fromIdx; i > 0; i--) {
    acc += haversineMeters(line[i], line[i - 1]);
    if (acc >= distanceM) return i - 1;
  }
  return 0;
}

function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const aH = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(aH)));
}
