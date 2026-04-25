/**
 * Camera 3D Models — InstancedMesh для дорожных камер + FOV cones.
 *
 * Камера = коробка на столбе + полупрозрачный конус (зона видимости).
 */

import * as THREE from 'three';
import type { RoadCamera, CameraEnforcementType } from '@/types/roadInfra';
import { lngLatToSceneXY } from './threeOverlay';

interface SceneOrigin { lat: number; lng: number }

const CAM_BODY = { w: 0.3, h: 0.2, d: 0.4 };
const POLE_RADIUS = 0.05;

const FOV_COLOR: Record<CameraEnforcementType, number> = {
  maxspeed: 0xff9800,
  average_speed: 0xe53935,
  red_signal: 0x9c27b0,
  check: 0x2196f3,
  toll: 0x4caf50,
  access_restriction: 0x607d8b,
};

export function buildCamerasMesh(
  cameras: RoadCamera[],
  origin: SceneOrigin
): THREE.Group | null {
  if (cameras.length === 0) return null;

  const group = new THREE.Group();
  group.name = 'road-cameras';

  // Группируем по enforcement типу для общего материала FOV
  const byType = new Map<CameraEnforcementType, RoadCamera[]>();
  for (const cam of cameras) {
    const arr = byType.get(cam.enforcement) ?? [];
    arr.push(cam);
    byType.set(cam.enforcement, arr);
  }

  // Body + pole — общая геометрия для всех камер
  const bodyGeom = new THREE.BoxGeometry(CAM_BODY.w, CAM_BODY.h, CAM_BODY.d);
  const poleGeom = new THREE.CylinderGeometry(POLE_RADIUS, POLE_RADIUS, 1, 8);
  // unit-cylinder, scale в Y для разной высоты

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x37474f,
    roughness: 0.6,
    metalness: 0.5,
  });
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0x9e9e9e,
    roughness: 0.5,
    metalness: 0.7,
  });

  const bodyInst = new THREE.InstancedMesh(bodyGeom, bodyMat, cameras.length);
  const poleInst = new THREE.InstancedMesh(poleGeom, poleMat, cameras.length);
  bodyInst.name = 'cameras-body';
  poleInst.name = 'cameras-pole';

  const tmp = new THREE.Object3D();
  cameras.forEach((cam, i) => {
    const xy = lngLatToSceneXY(origin, cam.location.lng, cam.location.lat);
    const dirRad = (cam.direction * Math.PI) / 180;
    const h = cam.heightMeters > 0 ? cam.heightMeters : 5;

    // Body
    tmp.position.set(xy.x, xy.y, h);
    tmp.rotation.set(0, 0, -dirRad);
    tmp.scale.set(1, 1, 1);
    tmp.updateMatrix();
    bodyInst.setMatrixAt(i, tmp.matrix);

    // Pole
    tmp.position.set(xy.x, xy.y, h / 2);
    tmp.rotation.set(Math.PI / 2, 0, 0);
    tmp.scale.set(1, h, 1);
    tmp.updateMatrix();
    poleInst.setMatrixAt(i, tmp.matrix);
  });

  bodyInst.instanceMatrix.needsUpdate = true;
  poleInst.instanceMatrix.needsUpdate = true;

  group.add(bodyInst);
  group.add(poleInst);

  // FOV cones — отдельный mesh на enforcement тип
  for (const [type, list] of byType) {
    const fovGroup = buildFovCones(list, FOV_COLOR[type], origin);
    fovGroup.name = `cameras-fov-${type}`;
    group.add(fovGroup);
  }

  return group;
}

function buildFovCones(
  cameras: RoadCamera[],
  color: number,
  origin: SceneOrigin
): THREE.Group {
  const group = new THREE.Group();
  for (const cam of cameras) {
    const xy = lngLatToSceneXY(origin, cam.location.lng, cam.location.lat);
    const fovRad = (cam.fovDegrees * Math.PI) / 180;
    const radius = cam.rangeMeters * Math.tan(fovRad / 2);
    const height = cam.rangeMeters;
    const dirRad = (cam.direction * Math.PI) / 180;
    const camHeight = cam.heightMeters > 0 ? cam.heightMeters : 5;

    const geom = new THREE.ConeGeometry(radius, height, 16, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    // По умолчанию ConeGeometry смотрит вверх (Y), вершина в +Y/2
    // Нам надо: вершина в точке камеры, основание спереди по dir
    // Поворот: повернуть вокруг X на -90° → cone горизонтально с +X, потом по dir вокруг Z
    mesh.rotation.x = -Math.PI / 2;
    // После rotation X основание по +Z, нам надо по +X направления
    // Затем поворачиваем по Z на dirRad
    mesh.rotateZ(-dirRad);
    // И сместить чтобы вершина была в начале координат (вершина в Y=h/2 после rotation = в Z=h/2)
    // Точка камеры: переносим на (0,0,camHeight) и сдвигаем вперёд на h/2
    mesh.position.set(
      xy.x + Math.sin(dirRad) * height / 2,
      xy.y + Math.cos(dirRad) * height / 2,
      camHeight
    );

    group.add(mesh);
  }
  return group;
}

export function attachCameraMetadata(group: THREE.Group, cameras: RoadCamera[]): void {
  group.userData.cameras = cameras;
}
