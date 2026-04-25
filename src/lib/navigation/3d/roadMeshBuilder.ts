/**
 * Road Mesh Builder — генерирует 3D-меш дорожного полотна и разметки.
 *
 * Подход:
 *   - Triangle strip из leftEdge / rightEdge каждой полосы → асфальт
 *   - Разметка как тонкие 3D-плоскости z=0.02 (2см над дорогой)
 *   - Объединяем все полосы одной дороги в единую BufferGeometry
 *     для минимизации draw calls
 */

import * as THREE from 'three';
import type { HDLane, LaneMarking } from '@/types/roadInfra';
import { lngLatToSceneXY } from './threeOverlay';
import { getMarkingSpec } from '../lanes/markingRenderer';

const ROAD_Z = 0;
const MARKING_Z = 0.02;

interface SceneOrigin { lat: number; lng: number }

/** Строит меш асфальта из набора полос. */
export function buildRoadSurfaceMesh(
  lanes: HDLane[],
  origin: SceneOrigin
): THREE.Mesh | null {
  if (lanes.length === 0) return null;

  const positions: number[] = [];
  const indices: number[] = [];
  let baseIndex = 0;

  for (const lane of lanes) {
    const left = lane.leftEdge;
    const right = lane.rightEdge;
    const n = Math.min(left.length, right.length);
    if (n < 2) continue;

    // Точки в сцене
    for (let i = 0; i < n; i++) {
      const lXY = lngLatToSceneXY(origin, left[i].lng, left[i].lat);
      const rXY = lngLatToSceneXY(origin, right[i].lng, right[i].lat);
      positions.push(lXY.x, lXY.y, ROAD_Z);
      positions.push(rXY.x, rXY.y, ROAD_Z);
    }

    // Triangle strip: для каждого сегмента 2 треугольника
    for (let i = 0; i < n - 1; i++) {
      const i0 = baseIndex + i * 2;
      const i1 = i0 + 1;
      const i2 = i0 + 2;
      const i3 = i0 + 3;
      indices.push(i0, i2, i1);
      indices.push(i1, i2, i3);
    }
    baseIndex += n * 2;
  }

  if (positions.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    roughness: 0.92,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: 1,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'road-surface';
  mesh.frustumCulled = true;
  return mesh;
}

/** Строит меши разметки (плоскости поверх дороги). */
export function buildMarkingsMesh(
  markings: LaneMarking[],
  origin: SceneOrigin
): THREE.Group | null {
  if (markings.length === 0) return null;

  const group = new THREE.Group();
  group.name = 'road-markings';

  for (const marking of markings) {
    const spec = getMarkingSpec(marking.type);
    const meshes = buildMarkingLine(marking.geometry, spec.widthM, spec.color, spec.dashPattern, origin);
    for (const m of meshes) {
      group.add(m);
      if (spec.isDouble) {
        // Вторая параллельная линия с offset
        const offset = 0.3; // 30 см между двумя сплошными
        const offsetMeshes = buildMarkingLine(
          offsetPolyline(marking.geometry, offset),
          spec.widthM,
          spec.color,
          spec.dashPattern,
          origin
        );
        offsetMeshes.forEach((mm) => group.add(mm));
      }
    }
  }
  return group;
}

function buildMarkingLine(
  line: { lat: number; lng: number }[],
  widthM: number,
  color: string,
  dashPattern: [number, number] | null,
  origin: SceneOrigin
): THREE.Mesh[] {
  const points = line.map((p) => lngLatToSceneXY(origin, p.lng, p.lat));
  if (points.length < 2) return [];

  const segments = dashPattern ? splitIntoDashes(points, dashPattern) : [points];
  const meshes: THREE.Mesh[] = [];

  for (const seg of segments) {
    const geom = buildRibbonGeometry(seg, widthM);
    if (!geom) continue;
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      toneMapped: false,
      depthWrite: false,
    });
    meshes.push(new THREE.Mesh(geom, mat));
  }

  return meshes;
}

function buildRibbonGeometry(
  points: { x: number; y: number }[],
  widthM: number
): THREE.BufferGeometry | null {
  const n = points.length;
  if (n < 2) return null;

  const positions: number[] = [];
  const indices: number[] = [];
  const half = widthM / 2;

  for (let i = 0; i < n; i++) {
    const tan = tangentAt(points, i);
    const len = Math.hypot(tan.x, tan.y) || 1;
    const nx = -tan.y / len;
    const ny = tan.x / len;
    const p = points[i];
    positions.push(p.x + nx * half, p.y + ny * half, MARKING_Z);
    positions.push(p.x - nx * half, p.y - ny * half, MARKING_Z);
  }
  for (let i = 0; i < n - 1; i++) {
    const i0 = i * 2;
    indices.push(i0, i0 + 2, i0 + 1);
    indices.push(i0 + 1, i0 + 2, i0 + 3);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function tangentAt(pts: { x: number; y: number }[], i: number): { x: number; y: number } {
  const prev = pts[Math.max(0, i - 1)];
  const next = pts[Math.min(pts.length - 1, i + 1)];
  return { x: next.x - prev.x, y: next.y - prev.y };
}

function splitIntoDashes(
  pts: { x: number; y: number }[],
  pattern: [number, number]
): { x: number; y: number }[][] {
  const [dashLen, gapLen] = pattern;
  const cycle = dashLen + gapLen;
  const result: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  let traveled = 0;

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen === 0) continue;

    const dx = (b.x - a.x) / segLen;
    const dy = (b.y - a.y) / segLen;

    let pos = 0;
    while (pos < segLen) {
      const phase = (traveled + pos) % cycle;
      const inDash = phase < dashLen;
      const remainInPhase = (inDash ? dashLen - phase : cycle - phase);
      const stepLen = Math.min(segLen - pos, remainInPhase);

      if (inDash) {
        if (current.length === 0) {
          current.push({ x: a.x + dx * pos, y: a.y + dy * pos });
        }
        current.push({ x: a.x + dx * (pos + stepLen), y: a.y + dy * (pos + stepLen) });
      } else if (current.length > 1) {
        result.push(current);
        current = [];
      } else {
        current = [];
      }

      pos += stepLen;
    }
    traveled += segLen;
  }

  if (current.length > 1) result.push(current);
  return result;
}

function offsetPolyline(
  line: { lat: number; lng: number }[],
  offsetM: number
): { lat: number; lng: number }[] {
  // Грубое смещение: для двойной разметки с offset 30см
  const M_PER_DEG_LAT = 111_320;
  const result: { lat: number; lng: number }[] = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    const dLat = b.lat - a.lat;
    const dLng = b.lng - a.lng;
    const len = Math.hypot(dLat * M_PER_DEG_LAT, dLng * M_PER_DEG_LAT * Math.cos((line[i].lat * Math.PI) / 180));
    if (len === 0) {
      result.push(line[i]);
      continue;
    }
    const nLat = -dLng / len * offsetM;
    const nLng = dLat / len * offsetM;
    result.push({
      lat: line[i].lat + nLat / M_PER_DEG_LAT,
      lng: line[i].lng + nLng / (111_320 * Math.cos((line[i].lat * Math.PI) / 180)),
    });
  }
  return result;
}
