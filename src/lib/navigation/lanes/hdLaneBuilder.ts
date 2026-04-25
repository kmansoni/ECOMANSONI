/**
 * HD Lane Builder — превращает осевую линию дороги в HD-полосы с offset.
 *
 * Алгоритм:
 *   1. Сглаживаем осевую линию Catmull-Rom (без Three.js — пишем свой)
 *   2. Для каждой полосы вычисляем offset от центра
 *   3. Перпендикуляр к локальному tangent → смещение левой и правой кромки
 *   4. Triangle strip: leftEdge[i], rightEdge[i], leftEdge[i+1], rightEdge[i+1]
 *
 * Работает в "локальных" координатах (метры, плоскость касательная к Земле),
 * затем конвертит обратно в LatLng.
 */

import type { LatLng } from '@/types/taxi';
import type { HDLane } from '@/types/roadInfra';

interface XY { x: number; y: number }

/** Latitude → metres factor (for small areas) */
const M_PER_DEG_LAT = 111_320;
function mPerDegLng(latDeg: number): number {
  return 111_320 * Math.cos((latDeg * Math.PI) / 180);
}

function toLocal(p: LatLng, origin: LatLng): XY {
  return {
    x: (p.lng - origin.lng) * mPerDegLng(origin.lat),
    y: (p.lat - origin.lat) * M_PER_DEG_LAT,
  };
}

function toLatLng(p: XY, origin: LatLng): LatLng {
  return {
    lat: origin.lat + p.y / M_PER_DEG_LAT,
    lng: origin.lng + p.x / mPerDegLng(origin.lat),
  };
}

/**
 * Catmull-Rom через 4 точки. tension в [0..1], 0.5 = "centripetal".
 * Возвращает точку на сегменте p1→p2 при параметре t∈[0..1].
 */
function catmullRom(p0: XY, p1: XY, p2: XY, p3: XY, t: number, tension = 0.5): XY {
  const t2 = t * t;
  const t3 = t2 * t;
  const m1x = tension * (p2.x - p0.x);
  const m1y = tension * (p2.y - p0.y);
  const m2x = tension * (p3.x - p1.x);
  const m2y = tension * (p3.y - p1.y);

  const h1 = 2 * t3 - 3 * t2 + 1;
  const h2 = -2 * t3 + 3 * t2;
  const h3 = t3 - 2 * t2 + t;
  const h4 = t3 - t2;

  return {
    x: h1 * p1.x + h2 * p2.x + h3 * m1x + h4 * m2x,
    y: h1 * p1.y + h2 * p2.y + h3 * m1y + h4 * m2y,
  };
}

/** Сглаживает полилинию через Catmull-Rom субдискретизацией. */
function smoothPolyline(pts: XY[], subdivisions: number): XY[] {
  if (pts.length < 2) return pts;
  if (pts.length === 2) return pts;

  const result: XY[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < subdivisions; s++) {
      const t = s / subdivisions;
      result.push(catmullRom(p0, p1, p2, p3, t));
    }
  }
  result.push(pts[pts.length - 1]);
  return result;
}

/** Перпендикуляр к tangent (поворот на 90° против часовой) */
function perpendicular(tangent: XY): XY {
  const len = Math.hypot(tangent.x, tangent.y) || 1;
  return { x: -tangent.y / len, y: tangent.x / len };
}

function tangentAt(pts: XY[], i: number): XY {
  const prev = pts[Math.max(0, i - 1)];
  const next = pts[Math.min(pts.length - 1, i + 1)];
  return { x: next.x - prev.x, y: next.y - prev.y };
}

interface BuildLaneOptions {
  /** Subdivisions per segment. Default 4 */
  subdivisions?: number;
  /** Catmull-Rom tension. Default 0.5 (centripetal) */
  tension?: number;
}

export interface BuiltLaneGeometry {
  laneId: string;
  index: number;
  centerline: LatLng[];
  leftEdge: LatLng[];
  rightEdge: LatLng[];
}

/**
 * Строит HD-геометрию для всех полос одной дороги.
 *
 * @param centerline Осевая линия дороги (из OSM way)
 * @param totalLanes Количество полос
 * @param laneWidth Ширина одной полосы (м)
 * @param laneIds ID полос (опционально, иначе генерируется)
 */
export function buildLanesFromCenterline(
  centerline: LatLng[],
  totalLanes: number,
  laneWidth: number,
  laneIds?: string[],
  opts: BuildLaneOptions = {}
): BuiltLaneGeometry[] {
  if (centerline.length < 2 || totalLanes <= 0) return [];

  const subdivisions = Math.max(1, opts.subdivisions ?? 4);
  const origin = centerline[0];

  // 1. Перевод в локальные XY
  const localCenter = centerline.map((p) => toLocal(p, origin));
  // 2. Сглаживание
  const smoothed = smoothPolyline(localCenter, subdivisions);

  // 3. Для каждой полосы — offset
  const result: BuiltLaneGeometry[] = [];
  // Center of lane group: лево—right offset = (i - (N-1)/2) * laneWidth
  for (let i = 0; i < totalLanes; i++) {
    const offset = (i - (totalLanes - 1) / 2) * laneWidth;
    const halfWidth = laneWidth / 2;

    const localCenterline: XY[] = [];
    const localLeft: XY[] = [];
    const localRight: XY[] = [];

    for (let j = 0; j < smoothed.length; j++) {
      const p = smoothed[j];
      const t = tangentAt(smoothed, j);
      const n = perpendicular(t);

      const center: XY = { x: p.x + n.x * offset, y: p.y + n.y * offset };
      const left: XY = { x: center.x + n.x * halfWidth, y: center.y + n.y * halfWidth };
      const right: XY = { x: center.x - n.x * halfWidth, y: center.y - n.y * halfWidth };

      localCenterline.push(center);
      localLeft.push(left);
      localRight.push(right);
    }

    result.push({
      laneId: laneIds?.[i] ?? `lane-${i}`,
      index: i,
      centerline: localCenterline.map((p) => toLatLng(p, origin)),
      leftEdge: localLeft.map((p) => toLatLng(p, origin)),
      rightEdge: localRight.map((p) => toLatLng(p, origin)),
    });
  }

  return result;
}

/**
 * Применяет HD-геометрию к существующим HDLane объектам (in-place возврат новых).
 * Используется после overpassScanner: lanes идут плоскими, нужно построить геометрию.
 */
export function enrichLanesWithHDGeometry(lanes: HDLane[]): HDLane[] {
  if (lanes.length === 0) return lanes;

  // Группируем по edgeIndex (id формата "wayId:laneIndex")
  const groups = new Map<string, HDLane[]>();
  for (const lane of lanes) {
    const wayId = lane.id.split(':')[0];
    const arr = groups.get(wayId) ?? [];
    arr.push(lane);
    groups.set(wayId, arr);
  }

  const result: HDLane[] = [];
  for (const [, group] of groups) {
    const sorted = [...group].sort((a, b) => a.index - b.index);
    const first = sorted[0];
    if (!first) continue;
    const built = buildLanesFromCenterline(
      first.centerline, // у всех в группе одна осевая после сканера
      sorted.length,
      first.widthMeters,
      sorted.map((l) => l.id)
    );
    for (const orig of sorted) {
      const b = built[orig.index];
      if (!b) {
        result.push(orig);
        continue;
      }
      result.push({
        ...orig,
        centerline: b.centerline,
        leftEdge: b.leftEdge,
        rightEdge: b.rightEdge,
      });
    }
  }
  return result;
}
