/**
 * Sign 3D Models — таблички знаков с canvas-генерируемыми текстурами.
 *
 * Стратегия:
 *   - Текстуры генерируются on-demand через signTextureGenerator (Canvas 2D)
 *   - Знаки с одинаковым atlasKey (тег + value) делят материал и InstancedMesh
 *   - Столбы (poles) — общий InstancedMesh для всех знаков
 *
 * Размеры (стандарт):
 *   - Знак: 700×700 мм
 *   - Высота столба: 2.5 м
 */

import * as THREE from 'three';
import type { RoadSign } from '@/types/roadInfra';
import { lngLatToSceneXY } from './threeOverlay';
import { getSignAtlasKey } from '../infra/signClassifier';
import { getOrCreateSignTexture } from './signTextureGenerator';

interface SceneOrigin { lat: number; lng: number }

const SIGN_SIZE = 0.7;
const POLE_RADIUS = 0.04;
const DEFAULT_POLE_HEIGHT = 2.5;

/**
 * Создаёт группу из:
 *   - InstancedMesh столбов (один для всех)
 *   - InstancedMesh табличек по группам atlasKey
 * Каждой группе — свой материал с canvas-текстурой.
 */
export function buildSignsInstancedMesh(
  signs: RoadSign[],
  origin: SceneOrigin
): THREE.Group | null {
  if (signs.length === 0) return null;

  const group = new THREE.Group();
  group.name = 'road-signs';

  const plateGeom = new THREE.PlaneGeometry(SIGN_SIZE, SIGN_SIZE);
  const poleGeom = new THREE.CylinderGeometry(POLE_RADIUS, POLE_RADIUS, DEFAULT_POLE_HEIGHT, 8);

  // Группируем по уникальной комбинации тег+value (для общего материала)
  const groups = new Map<string, RoadSign[]>();
  for (const s of signs) {
    const key = `${getSignAtlasKey(s.tag)}|${s.value ?? ''}`;
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }

  // Общий материал столба
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0x9e9e9e,
    roughness: 0.5,
    metalness: 0.7,
  });
  const poleInst = new THREE.InstancedMesh(poleGeom, poleMat, signs.length);
  poleInst.name = 'signs-pole';

  const tmp = new THREE.Object3D();
  signs.forEach((sign, i) => {
    const xy = lngLatToSceneXY(origin, sign.location.lng, sign.location.lat);
    const poleHeight = sign.poleHeightM > 0 ? sign.poleHeightM : DEFAULT_POLE_HEIGHT;
    tmp.position.set(xy.x, xy.y, poleHeight / 2);
    tmp.rotation.set(Math.PI / 2, 0, 0);
    tmp.scale.set(1, 1, 1);
    tmp.updateMatrix();
    poleInst.setMatrixAt(i, tmp.matrix);
  });
  poleInst.instanceMatrix.needsUpdate = true;
  group.add(poleInst);

  // Группы табличек
  for (const [, list] of groups) {
    const sample = list[0];
    const texture = getOrCreateSignTexture(sample.tag, sample.value);
    const plateMat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.6,
      metalness: 0.05,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const plateInst = new THREE.InstancedMesh(plateGeom, plateMat, list.length);
    plateInst.name = `signs-plate-${getSignAtlasKey(sample.tag)}`;

    list.forEach((sign, i) => {
      const xy = lngLatToSceneXY(origin, sign.location.lng, sign.location.lat);
      const facing = sign.facingDirection ?? 0;
      const facingRad = (facing * Math.PI) / 180;
      const poleHeight = sign.poleHeightM > 0 ? sign.poleHeightM : DEFAULT_POLE_HEIGHT;
      tmp.position.set(xy.x, xy.y, poleHeight);
      tmp.rotation.set(Math.PI / 2, 0, facingRad);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      plateInst.setMatrixAt(i, tmp.matrix);
    });
    plateInst.instanceMatrix.needsUpdate = true;
    plateInst.userData.signs = list; // для raycast
    group.add(plateInst);
  }

  return group;
}

/** Сохраняет ссылку на знак для hit-testing (raycast → metadata) */
export function attachSignMetadata(
  group: THREE.Group,
  signs: RoadSign[]
): void {
  group.userData.signs = signs;
}

export { getSignAtlasKey };
