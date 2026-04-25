/**
 * Three.js CustomLayer для MapLibre GL JS.
 *
 * Работает поверх MapLibre, делит WebGL context, синхронизирует камеру через matrix.
 * Все объекты создаются в Mercator-координатах через MercatorCoordinate.
 *
 * Lifecycle:
 *   onAdd(map, gl)  → инициализация Three.js Renderer/Scene/Camera
 *   render(gl, m)   → вызывается каждый кадр MapLibre
 *   onRemove()      → cleanup всех ресурсов
 *
 * IMPORTANT:
 *   - НЕ создавать новый WebGL2RenderingContext, использовать gl от MapLibre
 *   - НЕ вызывать renderer.render(scene, camera) c renderer.setRenderTarget,
 *     просто scene будет отрендерена в текущий gl context
 */

import * as THREE from 'three';
import type { Map as MapLibreMap, CustomLayerInterface, MercatorCoordinate as MC } from 'maplibre-gl';

interface OverlayHandle {
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
  /** Оригин (LngLat) для всех объектов сцены */
  origin: { lng: number; lat: number; altitude: number };
  /** Helper: 1 meter → mercator units */
  meterScale: number;
}

let _maplibreMod: typeof import('maplibre-gl') | null = null;
async function getMaplibre(): Promise<typeof import('maplibre-gl')> {
  if (_maplibreMod) return _maplibreMod;
  _maplibreMod = await import('maplibre-gl');
  return _maplibreMod;
}

export interface ThreeOverlayOptions {
  /** Точка отсчёта сцены (LngLat). Обычно = центр карты при создании */
  origin: { lng: number; lat: number; altitude?: number };
  /** Callback для построения сцены при инициализации */
  onSceneReady?: (handle: OverlayHandle) => void;
  /** Callback для обновления сцены каждый кадр (опционально, для анимаций) */
  onFrame?: (handle: OverlayHandle, deltaMs: number) => void;
}

export class ThreeOverlay implements CustomLayerInterface {
  readonly id: string;
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;

  private map: MapLibreMap | null = null;
  private handle: OverlayHandle | null = null;
  private lastFrameAt = 0;
  private opts: ThreeOverlayOptions;
  private mercatorOrigin: MC | null = null;

  constructor(id: string, opts: ThreeOverlayOptions) {
    this.id = id;
    this.opts = opts;
  }

  async onAdd(map: MapLibreMap, gl: WebGL2RenderingContext | WebGLRenderingContext) {
    this.map = map;

    const { MercatorCoordinate } = await getMaplibre();
    const o = this.opts.origin;
    this.mercatorOrigin = MercatorCoordinate.fromLngLat([o.lng, o.lat], o.altitude ?? 0);
    const meterScale = this.mercatorOrigin.meterInMercatorCoordinateUnits();

    const scene = new THREE.Scene();
    const camera = new THREE.Camera();

    // Освещение по умолчанию — переопределяется в lightingSystem
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    const directional = new THREE.DirectionalLight(0xffffff, 1.0);
    directional.position.set(0, -70, 100).normalize();
    scene.add(ambient);
    scene.add(directional);

    const renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    renderer.autoClear = false;

    this.handle = {
      scene,
      camera,
      renderer,
      origin: {
        lng: o.lng,
        lat: o.lat,
        altitude: o.altitude ?? 0,
      },
      meterScale,
    };

    this.opts.onSceneReady?.(this.handle);
  }

  render(_gl: WebGL2RenderingContext | WebGLRenderingContext, args: { defaultProjectionData: { mainMatrix: number[] | Float32Array | Float64Array } }) {
    if (!this.handle || !this.map || !this.mercatorOrigin) return;

    const now = performance.now();
    const delta = this.lastFrameAt === 0 ? 0 : now - this.lastFrameAt;
    this.lastFrameAt = now;

    this.opts.onFrame?.(this.handle, delta);

    // Матрица из MapLibre — World coords → clip coords
    const m = new THREE.Matrix4().fromArray(Array.from(args.defaultProjectionData.mainMatrix));

    // Локальная матрица сцены: trans + scale в mercator units
    const o = this.mercatorOrigin;
    const ms = this.handle.meterScale;
    const local = new THREE.Matrix4()
      .makeTranslation(o.x, o.y, o.z)
      .scale(new THREE.Vector3(ms, -ms, ms)); // Y flipped: meters Y → mercator -Y

    (this.handle.camera as THREE.Camera & { projectionMatrix: THREE.Matrix4 }).projectionMatrix =
      m.multiply(local);

    this.handle.renderer.resetState();
    this.handle.renderer.render(this.handle.scene, this.handle.camera);

    this.map.triggerRepaint();
  }

  onRemove() {
    if (!this.handle) return;
    disposeScene(this.handle.scene);
    this.handle.renderer.dispose();
    this.handle = null;
    this.map = null;
    this.mercatorOrigin = null;
  }

  /** Возвращает scene/camera для добавления объектов извне */
  getHandle(): OverlayHandle | null {
    return this.handle;
  }
}

/** Конвертирует LngLat → координаты сцены (метры от origin) */
export function lngLatToSceneXY(
  origin: { lat: number; lng: number },
  lng: number,
  lat: number
): { x: number; y: number } {
  const M_PER_DEG_LAT = 111_320;
  const mPerLng = 111_320 * Math.cos((origin.lat * Math.PI) / 180);
  return {
    x: (lng - origin.lng) * mPerLng,
    y: (lat - origin.lat) * M_PER_DEG_LAT,
  };
}

/** Полная очистка сцены: dispose всех geometries, materials, textures */
export function disposeScene(scene: THREE.Scene): void {
  scene.traverse((obj) => {
    if ((obj as THREE.Mesh).geometry) {
      (obj as THREE.Mesh).geometry?.dispose?.();
    }
    const mat = (obj as THREE.Mesh).material;
    if (Array.isArray(mat)) {
      mat.forEach(disposeMaterial);
    } else if (mat) {
      disposeMaterial(mat);
    }
  });
  while (scene.children.length > 0) {
    scene.remove(scene.children[0]);
  }
}

function disposeMaterial(mat: THREE.Material): void {
  for (const key of Object.keys(mat) as Array<keyof THREE.Material>) {
    const v = (mat as unknown as Record<string, unknown>)[key as string];
    if (v && typeof v === 'object' && 'dispose' in v && typeof (v as { dispose: unknown }).dispose === 'function') {
      (v as { dispose: () => void }).dispose();
    }
  }
  mat.dispose();
}
