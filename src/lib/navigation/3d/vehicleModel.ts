/**
 * Vehicle Model — 3D модель автомобиля игрока.
 *
 * MVP: простая геометрия (BoxGeometry + детали) — позже заменяется GLTF.
 * Интерфейс готов под загрузку GLTF (skinned mesh, колёса).
 */

import * as THREE from 'three';

interface SceneOrigin { lat: number; lng: number }

export interface VehicleHandle {
  group: THREE.Group;
  /** Установить позицию по LngLat */
  setPosition: (lng: number, lat: number) => void;
  /** Установить heading в градусах (0 = север) */
  setHeading: (degrees: number) => void;
  /** Анимация колёс */
  setWheelRotation: (radians: number) => void;
  dispose: () => void;
}

export function buildVehicleModel(origin: SceneOrigin): VehicleHandle {
  const group = new THREE.Group();
  group.name = 'vehicle';

  // Кузов (низ)
  const bodyGeom = new THREE.BoxGeometry(1.8, 4.5, 1.0);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x1976d2,
    roughness: 0.4,
    metalness: 0.7,
  });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.position.set(0, 0, 0.6);
  group.add(body);

  // Крыша
  const roofGeom = new THREE.BoxGeometry(1.6, 2.5, 0.6);
  const roof = new THREE.Mesh(roofGeom, bodyMat);
  roof.position.set(0, 0.2, 1.4);
  group.add(roof);

  // Стёкла
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    transparent: true,
    opacity: 0.6,
    roughness: 0.1,
    metalness: 0.9,
  });
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.05, 0.55), glassMat);
  windshield.position.set(0, 1.45, 1.4);
  group.add(windshield);

  // Колёса
  const wheelGeom = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const wheels: THREE.Mesh[] = [];
  const positions = [
    [-0.9, 1.5, 0.35],
    [0.9, 1.5, 0.35],
    [-0.9, -1.5, 0.35],
    [0.9, -1.5, 0.35],
  ];
  for (const [x, y, z] of positions) {
    const w = new THREE.Mesh(wheelGeom, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, y, z);
    group.add(w);
    wheels.push(w);
  }

  // Фары (свет вперёд)
  const headlight = new THREE.SpotLight(0xffffe0, 0, 30, Math.PI / 5, 0.4, 1);
  headlight.position.set(0, 2, 0.8);
  headlight.target.position.set(0, 10, 0.8);
  group.add(headlight);
  group.add(headlight.target);

  // M_PER_DEG для setPosition
  const M_PER_DEG_LAT = 111_320;
  const mPerLng = 111_320 * Math.cos((origin.lat * Math.PI) / 180);

  return {
    group,
    setPosition(lng: number, lat: number) {
      group.position.x = (lng - origin.lng) * mPerLng;
      group.position.y = (lat - origin.lat) * M_PER_DEG_LAT;
    },
    setHeading(degrees: number) {
      // 0° = север (positive Y), поворот по Z по часовой
      group.rotation.z = (-degrees * Math.PI) / 180;
    },
    setWheelRotation(radians: number) {
      for (const w of wheels) {
        w.rotation.x = radians;
      }
    },
    dispose() {
      group.traverse((obj) => {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material;
        if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
        else mat?.dispose?.();
      });
    },
  };
}
