/**
 * Сегментация фона через TF.js BodyPix / Selfie Segmentation.
 * Функции: loadSegmentationModel(), segmentPerson(videoElement) → mask.
 * Замена фона на изображение / blur.
 */

import { logger } from '@/lib/logger';

let bodyPixModel: any = null;
let segModelLoading = false;

/**
 * Загружает модель сегментации (lazy).
 */
export async function loadSegmentationModel(): Promise<boolean> {
  if (bodyPixModel) return true;
  if (segModelLoading) return false;
  segModelLoading = true;

  try {
    const [bp, _tf] = await Promise.all([
      (Function('m', 'return import(m)') as (m: string) => Promise<any>)('@tensorflow-models/body-pix').catch(() => null),
      (Function('m', 'return import(m)') as (m: string) => Promise<any>)('@tensorflow/tfjs-core').catch(() => null),
    ]);

    if (bp) {
      await (Function('m', 'return import(m)') as (m: string) => Promise<any>)('@tensorflow/tfjs-backend-webgl').catch((err) => { logger.warn('[BackgroundSegmentation] WebGL backend load failed', { error: err }); });
      bodyPixModel = await bp.load({ architecture: 'MobileNetV1', outputStride: 16, multiplier: 0.75 });
      logger.debug('[BackgroundSeg] BodyPix model loaded');
      return true;
    }
  } catch (e) {
    logger.warn('[BackgroundSeg] BodyPix not available', { error: e });
  } finally {
    segModelLoading = false;
  }

  return false;
}

export interface SegmentationMask {
  data: Uint8Array; // 1 = person, 0 = background
  width: number;
  height: number;
}

/**
 * Сегментирует человека на видеоэлементе.
 * Возвращает маску.
 */
export async function segmentPerson(videoElement: HTMLVideoElement): Promise<SegmentationMask | null> {
  if (videoElement.readyState < 2) return null;

  if (bodyPixModel) {
    try {
      const segmentation = await bodyPixModel.segmentPerson(videoElement, {
        flipHorizontal: false,
        internalResolution: 'medium',
        segmentationThreshold: 0.7,
      });
      return {
        data: segmentation.data,
        width: segmentation.width,
        height: segmentation.height,
      };
    } catch (e) {
      logger.warn('[BackgroundSeg] segmentPerson error', { error: e });
    }
  }

  return null;
}

/**
 * Применяет blur к фону на canvas.
 */
export function applyBackgroundBlur(
  sourceCanvas: HTMLCanvasElement,
  mask: SegmentationMask,
  blurAmount = 10
): void {
  const ctx = sourceCanvas.getContext('2d');
  if (!ctx) return;

  // Создаём маску-оверлей
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = mask.width;
  maskCanvas.height = mask.height;
  const maskCtx = maskCanvas.getContext('2d');
  if (!maskCtx) return;

  const imageData = maskCtx.createImageData(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i++) {
    const alpha = mask.data[i] === 1 ? 0 : 255; // 0 = person (прозрачно), 255 = bg (непрозрачно)
    imageData.data[i * 4 + 3] = alpha;
  }
  maskCtx.putImageData(imageData, 0, 0);

  // Применяем blur к всему canvas, затем накладываем оригинал через маску
  ctx.filter = `blur(${blurAmount}px)`;
  ctx.drawImage(sourceCanvas, 0, 0);
  ctx.filter = 'none';

  // Восстанавливаем person через маску
  ctx.globalCompositeOperation = 'destination-over';
  ctx.drawImage(maskCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height);
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Заменяет фон на изображение.
 */
export function replaceBackground(
  targetCanvas: HTMLCanvasElement,
  videoElement: HTMLVideoElement,
  mask: SegmentationMask,
  backgroundImage: HTMLImageElement | HTMLCanvasElement
): void {
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;

  const W = targetCanvas.width;
  const H = targetCanvas.height;

  // Рисуем фон
  ctx.drawImage(backgroundImage, 0, 0, W, H);

  // Рисуем видео с маской
  const offscreen = document.createElement('canvas');
  offscreen.width = W;
  offscreen.height = H;
  const offCtx = offscreen.getContext('2d');
  if (!offCtx) return;

  offCtx.drawImage(videoElement, 0, 0, W, H);

  // Применяем маску person
  const maskScaled = document.createElement('canvas');
  maskScaled.width = W;
  maskScaled.height = H;
  const maskCtx = maskScaled.getContext('2d');
  if (!maskCtx) return;

  const maskData = document.createElement('canvas');
  maskData.width = mask.width;
  maskData.height = mask.height;
  const mdCtx = maskData.getContext('2d');
  if (!mdCtx) return;

  const imgData = mdCtx.createImageData(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i++) {
    imgData.data[i * 4 + 3] = mask.data[i] === 1 ? 255 : 0;
  }
  mdCtx.putImageData(imgData, 0, 0);
  maskCtx.drawImage(maskData, 0, 0, W, H);

  offCtx.globalCompositeOperation = 'destination-in';
  offCtx.drawImage(maskScaled, 0, 0);

  ctx.drawImage(offscreen, 0, 0);
}
