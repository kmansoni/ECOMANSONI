/**
 * HD Road Scene Orchestrator — главная точка входа для 3D-сцены дороги.
 *
 * Координирует работу:
 *   road-infra-scanner → lane-modeler → 3D mesh builders → ThreeOverlay
 *
 * Использование (из MapLibre3D.tsx):
 *
 *   const orchestrator = new HDRoadSceneOrchestrator(map, { centerLng, centerLat });
 *   await orchestrator.refreshForBBox(bbox);
 *   orchestrator.updateVehicle(lng, lat, heading);
 *   // ...
 *   orchestrator.dispose();
 */

import * as THREE from 'three';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { BBox, RoadInfraSnapshot, RoadCamera, RoadSign, BridgeGeometry } from '@/types/roadInfra';
import { ThreeOverlay, disposeScene, lngLatToSceneXY } from './threeOverlay';
import { buildRoadSurfaceMesh, buildMarkingsMesh } from './roadMeshBuilder';
import { buildSignsInstancedMesh, attachSignMetadata } from './signModels';
import { buildCamerasMesh, attachCameraMetadata } from './cameraModels';
import { applyLightingForNow } from './lightingSystem';
import { LODManager } from './lodManager';
import { buildVehicleModel, type VehicleHandle } from './vehicleModel';
import { scanInfrastructure } from '../infra';
import { enrichLanesWithHDGeometry, buildMarkingsForLaneGroup } from '../lanes';
import { logger } from '@/lib/logger';

const OVERLAY_LAYER_ID = 'mansoni-hd-road-3d';

export type HDInfraHit =
  | { kind: 'sign'; data: RoadSign; distanceM: number }
  | { kind: 'camera'; data: RoadCamera; distanceM: number }
  | { kind: 'bridge'; data: BridgeGeometry; distanceM: number };

export interface OrchestratorOptions {
  centerLng: number;
  centerLat: number;
  /** Включить ли освещение по времени суток */
  withLighting?: boolean;
  /** Callback на клик по знаку/камере */
  onObjectClick?: (kind: 'sign' | 'camera', metadata: Record<string, unknown>) => void;
}

export class HDRoadSceneOrchestrator {
  private map: MapLibreMap;
  private overlay: ThreeOverlay;
  private lodManager: LODManager;
  private vehicle: VehicleHandle | null = null;
  private currentInfraGroup: THREE.Group | null = null;
  private opts: OrchestratorOptions;
  private disposed = false;
  private refreshInflight: AbortController | null = null;
  private lastBBoxKey: string | null = null;
  private currentSnapshot: RoadInfraSnapshot | null = null;

  constructor(map: MapLibreMap, opts: OrchestratorOptions) {
    this.map = map;
    this.opts = opts;
    this.lodManager = new LODManager();

    this.overlay = new ThreeOverlay(OVERLAY_LAYER_ID, {
      origin: { lng: opts.centerLng, lat: opts.centerLat, altitude: 0 },
      onSceneReady: (handle) => {
        if (opts.withLighting !== false) {
          applyLightingForNow(handle.scene, opts.centerLat);
        }
        // Машина игрока
        this.vehicle = buildVehicleModel({ lng: opts.centerLng, lat: opts.centerLat });
        handle.scene.add(this.vehicle.group);
      },
      onFrame: (handle) => {
        this.lodManager.update(handle.scene, handle.camera);
      },
    });

    map.addLayer(this.overlay);
  }

  /**
   * Обновляет HD-инфраструктуру в bbox.
   * Дебаунсится автоматически (если та же ячейка — пропускается).
   */
  async refreshForBBox(bbox: BBox): Promise<void> {
    if (this.disposed) return;

    const key = bboxCellKey(bbox);
    if (key === this.lastBBoxKey && this.currentInfraGroup) {
      return; // та же ячейка
    }

    // Отменить предыдущий запрос
    this.refreshInflight?.abort();
    this.refreshInflight = new AbortController();
    const signal = this.refreshInflight.signal;

    try {
      const snapshot = await scanInfrastructure(bbox, {
        signal,
        cacheTTL: 1800, // 30 мин
      });
      if (signal.aborted || this.disposed) return;
      this.applySnapshot(snapshot);
      this.lastBBoxKey = key;
    } catch (err) {
      if (!signal.aborted) {
        logger.warn('[HDOrchestrator] Не удалось получить инфраструктуру', err);
      }
    }
  }

  /** Применить снимок инфраструктуры к сцене */
  private applySnapshot(snapshot: RoadInfraSnapshot): void {
    const handle = this.overlay.getHandle();
    if (!handle) return;

    // Удаляем старую группу
    if (this.currentInfraGroup) {
      handle.scene.remove(this.currentInfraGroup);
      disposeGroup(this.currentInfraGroup);
      this.currentInfraGroup = null;
    }

    const group = new THREE.Group();
    group.name = 'hd-infra';

    // Полосы → HD-геометрия
    const enrichedLanes = enrichLanesWithHDGeometry(snapshot.lanes);

    // Asphalt
    const surface = buildRoadSurfaceMesh(enrichedLanes, handle.origin);
    if (surface) {
      LODManager.enableLOD(surface, 'medium');
      group.add(surface);
    }

    // Markings (генерим из полос если в snapshot пусто)
    const markings = snapshot.markings.length > 0
      ? snapshot.markings
      : enrichedLanes.length > 0
        ? buildMarkingsForLaneGroup(enrichedLanes, {
            forwardLanes: enrichedLanes.length,
            backwardLanes: 0,
          })
        : [];

    const markingsMesh = buildMarkingsMesh(markings, handle.origin);
    if (markingsMesh) {
      LODManager.enableLOD(markingsMesh, 'high');
      group.add(markingsMesh);
    }

    // Signs
    const signsMesh = buildSignsInstancedMesh(snapshot.signs, handle.origin);
    if (signsMesh) {
      attachSignMetadata(signsMesh, snapshot.signs);
      LODManager.enableLOD(signsMesh, 'high');
      group.add(signsMesh);
    }

    // Cameras
    const camerasMesh = buildCamerasMesh(snapshot.cameras, handle.origin);
    if (camerasMesh) {
      attachCameraMetadata(camerasMesh, snapshot.cameras);
      group.add(camerasMesh);
    }

    handle.scene.add(group);
    this.currentInfraGroup = group;
    this.currentSnapshot = snapshot;

    this.map.triggerRepaint();
  }

  /**
   * Hit-test по LngLat: ищет ближайший объект инфраструктуры (sign/camera/bridge)
   * в радиусе search (метры). Используется для попапов при клике на карту.
   */
  hitTestAt(lng: number, lat: number, searchRadiusM = 15): HDInfraHit | null {
    const snap = this.currentSnapshot;
    if (!snap) return null;

    let best: HDInfraHit | null = null;

    const checkPoint = (kind: 'sign' | 'camera', data: RoadSign | RoadCamera) => {
      const d = haversineMeters({ lat, lng }, data.location);
      if (d > searchRadiusM) return;
      if (!best || d < best.distanceM) {
        best = { kind, data, distanceM: d } as HDInfraHit;
      }
    };

    for (const sign of snap.signs) checkPoint('sign', sign);
    for (const cam of snap.cameras) checkPoint('camera', cam);

    // Мосты — проверяем расстояние до полилинии
    for (const bridge of snap.bridges) {
      const d = distanceToPolylineM({ lat, lng }, bridge.geometry);
      if (d > searchRadiusM) continue;
      if (!best || d < best.distanceM) {
        best = { kind: 'bridge', data: bridge, distanceM: d };
      }
    }

    return best;
  }

  /** Обновить позицию/направление машины */
  updateVehicle(lng: number, lat: number, headingDeg: number): void {
    if (!this.vehicle) return;
    this.vehicle.setPosition(lng, lat);
    this.vehicle.setHeading(headingDeg);
    this.map.triggerRepaint();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.refreshInflight?.abort();

    try {
      this.map.removeLayer(OVERLAY_LAYER_ID);
    } catch {
      // layer may already be removed if map was destroyed
    }

    if (this.currentInfraGroup) {
      disposeGroup(this.currentInfraGroup);
      this.currentInfraGroup = null;
    }
    this.vehicle?.dispose();
    this.vehicle = null;

    const handle = this.overlay.getHandle();
    if (handle) disposeScene(handle.scene);
  }
}

function bboxCellKey(bbox: BBox): string {
  // Округление до 0.01° (~1 км) — как ячейка для дебаунса
  const round = (n: number) => Math.round(n * 100) / 100;
  return `${round(bbox.south)}:${round(bbox.west)}:${round(bbox.north)}:${round(bbox.east)}`;
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const aH = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(aH)));
}

function distanceToPolylineM(p: { lat: number; lng: number }, line: { lat: number; lng: number }[]): number {
  if (line.length === 0) return Infinity;
  if (line.length === 1) return haversineMeters(p, line[0]);

  let min = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const d = pointToSegmentMeters(p, line[i], line[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

function pointToSegmentMeters(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  // Простая аппроксимация: переводим в метровые xy относительно a, считаем евклид
  const M_PER_DEG_LAT = 111_320;
  const mPerLng = 111_320 * Math.cos((a.lat * Math.PI) / 180);
  const ax = 0;
  const ay = 0;
  const bx = (b.lng - a.lng) * mPerLng;
  const by = (b.lat - a.lat) * M_PER_DEG_LAT;
  const px = (p.lng - a.lng) * mPerLng;
  const py = (p.lat - a.lat) * M_PER_DEG_LAT;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px, py);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// Утилита нужна для signs.ts — перепроверка lngLatToSceneXY
void lngLatToSceneXY;

function disposeGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    const m = obj as THREE.Mesh;
    m.geometry?.dispose?.();
    const mat = m.material;
    if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
    else mat?.dispose?.();
  });
}
