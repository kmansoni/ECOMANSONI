/**
 * LOD Manager — управление уровнем детализации по расстоянию + frustum culling.
 *
 * Стратегия:
 *   < 50м   → full 3D mesh (signs, cameras, road markings)
 *   50-200м → упрощённая геометрия (low-poly), без текстур
 *   > 200м  → billboards / скрыто
 *
 * Frustum culling делается каждые 10 кадров (не каждый — дорого).
 */

import * as THREE from 'three';

export interface LODConfig {
  /** Дистанция переключения на средний LOD, м */
  near: number;
  /** Дистанция переключения на дальний LOD, м */
  far: number;
  /** Сколько кадров между обновлениями culling */
  cullEveryNFrames: number;
}

const DEFAULT_CONFIG: LODConfig = {
  near: 50,
  far: 200,
  cullEveryNFrames: 10,
};

export class LODManager {
  private cfg: LODConfig;
  private frameCounter = 0;
  private frustum = new THREE.Frustum();
  private projScreenMatrix = new THREE.Matrix4();
  private cameraPos = new THREE.Vector3();

  constructor(cfg: Partial<LODConfig> = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...cfg };
  }

  /**
   * Обновляет видимость объектов на основе LOD + frustum.
   * Должен вызываться в onFrame.
   */
  update(scene: THREE.Scene, camera: THREE.Camera): void {
    this.frameCounter++;
    if (this.frameCounter % this.cfg.cullEveryNFrames !== 0) return;

    // Frustum
    this.projScreenMatrix.multiplyMatrices(
      (camera as THREE.Camera & { projectionMatrix: THREE.Matrix4 }).projectionMatrix,
      camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
    camera.getWorldPosition(this.cameraPos);

    // Обходим scene — групппы помеченные lodEnabled
    scene.traverse((obj) => {
      if (!obj.userData.lodEnabled) return;
      const mesh = obj as THREE.Mesh;

      // Frustum check (упрощённо, по позиции объекта)
      const inFrustum = this.frustum.containsPoint(mesh.position) ||
        (mesh.geometry?.boundingSphere
          ? this.frustum.intersectsSphere(
              mesh.geometry.boundingSphere.clone().applyMatrix4(mesh.matrixWorld)
            )
          : true);

      if (!inFrustum) {
        mesh.visible = false;
        return;
      }

      // Distance-based LOD
      const dist = mesh.position.distanceTo(this.cameraPos);
      const lodLevel = obj.userData.lodLevel as 'high' | 'medium' | 'low' | undefined;

      if (lodLevel === 'high') {
        mesh.visible = dist < this.cfg.near;
      } else if (lodLevel === 'medium') {
        mesh.visible = dist >= this.cfg.near && dist < this.cfg.far;
      } else if (lodLevel === 'low') {
        mesh.visible = dist >= this.cfg.far;
      } else {
        mesh.visible = dist < this.cfg.far; // default: скрыть только дальние
      }
    });
  }

  /** Помечает объект как участвующий в LOD-системе */
  static enableLOD(obj: THREE.Object3D, level: 'high' | 'medium' | 'low' = 'high'): void {
    obj.userData.lodEnabled = true;
    obj.userData.lodLevel = level;
  }
}
