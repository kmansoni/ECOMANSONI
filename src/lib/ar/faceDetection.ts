/**
 * Face Detection через TensorFlow.js face-landmarks-detection / MediaPipe.
 * Lazy-load модели. Fallback: определение по цвету кожи через Canvas.
 */

import { logger } from '@/lib/logger';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Landmark {
  x: number;
  y: number;
  z?: number;
  name?: string;
}

export interface DetectedFace {
  boundingBox: BoundingBox;
  landmarks: Landmark[];
}

let detectorInstance: any = null;
let modelLoading = false;

/**
 * Загружает модель face detection (lazy).
 * Использует @tensorflow-models/face-landmarks-detection если доступна,
 * иначе fallback.
 */
export async function loadModel(): Promise<boolean> {
  if (detectorInstance) return true;
  if (modelLoading) return false;
  modelLoading = true;

  try {
    // Пытаемся загрузить TF.js face-landmarks-detection (динамический импорт)
    const [fld, _tf] = await Promise.all([
      (Function('m', 'return import(m)') as (m: string) => Promise<any>)('@tensorflow-models/face-landmarks-detection').catch(() => null),
      (Function('m', 'return import(m)') as (m: string) => Promise<any>)('@tensorflow/tfjs-core').catch(() => null),
    ]);

    if (fld) {
      await (Function('m', 'return import(m)') as (m: string) => Promise<any>)('@tensorflow/tfjs-backend-webgl').catch((err) => { logger.warn('[FaceDetection] WebGL backend load failed', { error: err }); });
      detectorInstance = await fld.createDetector(
        fld.SupportedModels.MediaPipeFaceMesh,
        { runtime: 'tfjs', maxFaces: 4 }
      );
      logger.debug('[FaceDetection] TF.js model loaded');
      return true;
    }
  } catch (e) {
    logger.warn('[FaceDetection] TF.js not available, using fallback', { error: e });
  } finally {
    modelLoading = false;
  }

  return false;
}

/**
 * Определяет лица на видеоэлементе.
 * Возвращает массив объектов с bounding box и landmarks.
 */
export async function detectFaces(videoElement: HTMLVideoElement): Promise<DetectedFace[]> {
  if (videoElement.readyState < 2) return [];

  // TF.js детектор
  if (detectorInstance) {
    try {
      const faces = await detectorInstance.estimateFaces(videoElement);
      return faces.map((f: any) => ({
        boundingBox: {
          x: f.box?.xMin ?? f.boundingBox?.topLeft?.[0] ?? 0,
          y: f.box?.yMin ?? f.boundingBox?.topLeft?.[1] ?? 0,
          width: (f.box?.width as number | undefined) ?? ((f.boundingBox?.bottomRight?.[0] ?? 100) - (f.boundingBox?.topLeft?.[0] ?? 0)),
          height: (f.box?.height as number | undefined) ?? ((f.boundingBox?.bottomRight?.[1] ?? 100) - (f.boundingBox?.topLeft?.[1] ?? 0)),
        },
        landmarks: (f.keypoints ?? f.scaledMesh ?? []).slice(0, 50).map((kp: any) => ({
          x: Array.isArray(kp) ? kp[0] : kp.x,
          y: Array.isArray(kp) ? kp[1] : kp.y,
          z: Array.isArray(kp) ? kp[2] : kp.z,
          name: kp.name,
        })),
      }));
    } catch {
      // fallback
    }
  }

  // Fallback: поиск по цвету кожи через Canvas
  return detectFacesByColor(videoElement);
}

function detectFacesByColor(videoElement: HTMLVideoElement): DetectedFace[] {
  try {
    const canvas = document.createElement('canvas');
    const W = 160, H = 120;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];

    ctx.drawImage(videoElement, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;

    let minX = W, maxX = 0, minY = H, maxY = 0, count = 0;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          count++;
        }
      }
    }

    if (count < 200) return [];

    const scaleX = videoElement.videoWidth / W;
    const scaleY = videoElement.videoHeight / H;

    return [{
      boundingBox: {
        x: minX * scaleX,
        y: minY * scaleY,
        width: (maxX - minX) * scaleX,
        height: (maxY - minY) * scaleY,
      },
      landmarks: [],
    }];
  } catch {
    return [];
  }
}
