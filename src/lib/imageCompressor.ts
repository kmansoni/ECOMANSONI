/**
 * @module imageCompressor
 * @description Client-side сжатие изображений через Canvas API.
 *
 * Архитектурные решения:
 * - OffscreenCanvas + createImageBitmap: не блокирует main thread, доступны в современных браузерах.
 * - Fallback на HTMLCanvasElement + Image element: для Safari < 16.4 где OffscreenCanvas ограничен.
 * - canvas.toBlob: асинхронный, не блокирует main thread в отличие от toDataURL.
 * - EXIF автоматически удаляется: Canvas API рисует пиксели без метаданных — privacy by design.
 * - URL.revokeObjectURL в finally: предотвращает утечку памяти при любом исходе.
 * - GIF/SVG/WebP не сжимаются: потеря анимации, векторности или overhead > экономии.
 */

import { logger } from './logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompressOptions {
  /** Максимальная ширина в пикселях (default: 2048) */
  maxWidth?: number;
  /** Максимальная высота в пикселях (default: 2048) */
  maxHeight?: number;
  /**
   * Качество JPEG/WebP в диапазоне 0–1 (default: 0.85).
   * Значения вне диапазона зажимаются: < 0 → 0.0, > 1 → 1.0.
   */
  quality?: number;
  /** Выходной MIME-тип (default: 'image/jpeg') */
  outputFormat?: 'image/jpeg' | 'image/webp';
  /**
   * Минимальный размер файла для запуска сжатия (bytes, default: 512_000 = 500 KB).
   * Если файл меньше — возвращается оригинал без обработки.
   */
  skipBelowBytes?: number;
}

export interface CompressResult {
  /** Сжатый файл (или оригинал если сжатие не применялось) */
  file: File;
  /** Оригинальный размер в байтах */
  originalSize: number;
  /** Размер после сжатия в байтах */
  compressedSize: number;
  /** Ширина после сжатия (или оригинала если сжатие пропущено) */
  width: number;
  /** Высота после сжатия (или оригинала если сжатие пропущено) */
  height: number;
  /** true если сжатие было применено */
  wasCompressed: boolean;
}

// ─── Presets ──────────────────────────────────────────────────────────────────

/**
 * Готовые пресеты сжатия для разных контекстов.
 * Используются в mediaUpload.ts для автоматического выбора по bucket.
 */
export const COMPRESS_PRESETS = {
  /** Посты, Stories — Instagram-подобное качество */
  post: {
    maxWidth: 1080,
    maxHeight: 1350,
    quality: 0.85,
    outputFormat: 'image/jpeg' as const,
  },
  /** Аватары пользователей — компактные квадратные миниатюры */
  avatar: {
    maxWidth: 512,
    maxHeight: 512,
    quality: 0.90,
    outputFormat: 'image/jpeg' as const,
  },
  /** Чат-медиа — баланс качества и размера */
  chat: {
    maxWidth: 1920,
    maxHeight: 1920,
    quality: 0.80,
    outputFormat: 'image/jpeg' as const,
  },
  /** Превью для Reels/видео — небольшой thumbnail */
  thumbnail: {
    maxWidth: 480,
    maxHeight: 480,
    quality: 0.80,
    outputFormat: 'image/jpeg' as const,
  },
} as const;

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MAX_WIDTH = 2048;
const DEFAULT_MAX_HEIGHT = 2048;
const DEFAULT_QUALITY = 0.85;
const DEFAULT_OUTPUT_FORMAT = 'image/jpeg' as const;
const DEFAULT_SKIP_BELOW_BYTES = 512_000; // 500 KB

/**
 * MIME-типы, которые НЕ сжимаются:
 * - image/gif   — потеря анимации
 * - image/svg+xml — потеря векторности
 * - image/webp  — уже оптимально сжат; повторное сжатие только ухудшит качество
 */
const NON_COMPRESSIBLE_TYPES = new Set([
  'image/gif',
  'image/svg+xml',
  'image/webp',
]);

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * Проверить, является ли файл сжимаемым изображением.
 *
 * Возвращает false для:
 * - GIF (потеря анимации)
 * - SVG (потеря векторности)
 * - WebP (уже оптимально сжат)
 * - Любых не-image/* MIME-типов
 */
export function isCompressibleImage(file: File): boolean {
  if (!file.type.startsWith('image/')) return false;
  return !NON_COMPRESSIBLE_TYPES.has(file.type);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Вычислить новые размеры изображения с сохранением пропорций (fit, не crop).
 * Если изображение уже вписывается в maxWidth × maxHeight — размеры не изменяются.
 *
 * @param srcWidth   Оригинальная ширина пикселей
 * @param srcHeight  Оригинальная высота пикселей
 * @param maxWidth   Максимально допустимая ширина
 * @param maxHeight  Максимально допустимая высота
 * @returns { width, height } — финальные размеры
 */
function computeDimensions(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  if (srcWidth <= maxWidth && srcHeight <= maxHeight) {
    return { width: srcWidth, height: srcHeight };
  }

  const ratioW = maxWidth / srcWidth;
  const ratioH = maxHeight / srcHeight;
  const ratio = Math.min(ratioW, ratioH);

  return {
    width: Math.round(srcWidth * ratio),
    height: Math.round(srcHeight * ratio),
  };
}

/**
 * Конвертировать Blob в File, сохранив имя оригинала.
 * Расширение имени файла заменяется на соответствующее outputFormat.
 *
 * @param blob         Blob из canvas.toBlob
 * @param originalName Оригинальное имя файла
 * @param outputFormat MIME-тип выходного изображения
 * @returns            File с обновлённым именем и типом
 */
function blobToFile(blob: Blob, originalName: string, outputFormat: string): File {
  const ext = outputFormat === 'image/webp' ? 'webp' : 'jpg';
  // Заменяем расширение оригинального имени
  const baseName = originalName.replace(/\.[^.]+$/, '');
  const newName = `${baseName}.${ext}`;
  return new File([blob], newName, { type: outputFormat });
}

/**
 * Обертка над canvas.toBlob в виде Promise.
 * Выбрасывает ошибку если браузер вернул null (Out of Memory или неподдерживаемый формат).
 */
function canvasToBlobAsync(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  outputFormat: string,
  quality: number,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    // OffscreenCanvas.convertToBlob возвращает Promise
    if (canvas instanceof OffscreenCanvas) {
      canvas
        .convertToBlob({ type: outputFormat, quality })
        .then(resolve)
        .catch(reject);
      return;
    }

    // HTMLCanvasElement.toBlob использует callback
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('canvas.toBlob returned null — out of memory or unsupported format'));
          return;
        }
        resolve(blob);
      },
      outputFormat,
      quality,
    );
  });
}

// ─── Core implementation: OffscreenCanvas path ────────────────────────────────

/**
 * Путь сжатия через OffscreenCanvas + createImageBitmap.
 * Доступен в Chrome 69+, Firefox 105+, Safari 16.4+.
 * Не блокирует main thread — createImageBitmap декодирует в фоне.
 *
 * @internal
 */
async function compressViaOffscreenCanvas(
  file: File,
  width: number,
  height: number,
  outputFormat: string,
  quality: number,
): Promise<Blob> {
  // createImageBitmap декодирует HEIC/JPEG/PNG без блокировки main thread.
  // Поддерживает File/Blob напрямую (без URL.createObjectURL).
  const bitmap = await createImageBitmap(file, {
    resizeWidth: width,
    resizeHeight: height,
    resizeQuality: 'high',
  });

  try {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('OffscreenCanvas: getContext("2d") returned null');
    }

    ctx.drawImage(bitmap, 0, 0, width, height);
    return await canvasToBlobAsync(canvas, outputFormat, quality);
  } finally {
    bitmap.close(); // Освобождаем VideoFrame/ImageBitmap memory
  }
}

// ─── Core implementation: HTMLCanvasElement fallback ──────────────────────────

/**
 * Fallback путь через HTMLCanvasElement + Image element.
 * Используется в Safari < 16.4 и браузерах без OffscreenCanvas.
 * Требует active DOM (не работает в Web Workers).
 *
 * @internal
 */
function compressViaHTMLCanvas(
  objectUrl: string,
  width: number,
  height: number,
  outputFormat: string,
  quality: number,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('HTMLCanvasElement: getContext("2d") returned null'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvasToBlobAsync(canvas, outputFormat, quality).then(resolve).catch(reject);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to decode image via HTMLImageElement'));
    };

    // crossOrigin не нужен: objectUrl — blob: URI, same-origin by definition
    img.src = objectUrl;
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Сжать изображение на клиенте через Canvas API.
 *
 * Порядок операций:
 * 1. Проверка isCompressibleImage — GIF/SVG/WebP возвращаются без изменений.
 * 2. Проверка skipBelowBytes — маленькие файлы возвращаются без изменений.
 * 3. Попытка через OffscreenCanvas + createImageBitmap (non-blocking).
 * 4. Fallback на HTMLCanvasElement + Image если OffscreenCanvas недоступен.
 * 5. EXIF автоматически удаляется — Canvas рисует только пиксели.
 * 6. URL.revokeObjectURL вызывается в finally для предотвращения утечки памяти.
 *
 * @param file    Исходный файл изображения
 * @param options Опции сжатия (все поля опциональны)
 * @returns       CompressResult с файлом и метриками сжатия
 * @throws        Error если Canvas API полностью недоступен (SSR, etc.)
 */
export async function compressImage(
  file: File,
  options?: CompressOptions,
): Promise<CompressResult> {
  const maxWidth = options?.maxWidth ?? DEFAULT_MAX_WIDTH;
  const maxHeight = options?.maxHeight ?? DEFAULT_MAX_HEIGHT;
  const quality = Math.min(1, Math.max(0, options?.quality ?? DEFAULT_QUALITY));
  const outputFormat = options?.outputFormat ?? DEFAULT_OUTPUT_FORMAT;
  const skipBelowBytes = options?.skipBelowBytes ?? DEFAULT_SKIP_BELOW_BYTES;

  const originalSize = file.size;

  // ── 1. Несжимаемые форматы (GIF/SVG/WebP) ──────────────────────────────────
  if (!isCompressibleImage(file)) {
    const skipResult: CompressResult = {
      file,
      originalSize,
      compressedSize: originalSize,
      // Размеры неизвестны без декодирования — возвращаем 0 для несжимаемых
      width: 0,
      height: 0,
      wasCompressed: false,
    };
    return skipResult;
  }

  // ── 2. Файл ниже порога — overhead сжатия превысит экономию ────────────────
  if (originalSize < skipBelowBytes) {
    const skipResult: CompressResult = {
      file,
      originalSize,
      compressedSize: originalSize,
      width: 0,
      height: 0,
      wasCompressed: false,
    };
    return skipResult;
  }

  // ── 3. Определить размеры через createImageBitmap (если доступен) ───────────
  // createImageBitmap декодирует заголовок без полного рендера — получаем w/h дёшево.
  let srcWidth: number;
  let srcHeight: number;
  let useOffscreen = typeof OffscreenCanvas !== 'undefined';
  const supportsCreateImageBitmap = typeof createImageBitmap !== 'undefined';

  // objectUrl создаётся только для fallback-пути; для OffscreenCanvas не нужен.
  let objectUrl: string | null = null;

  try {
    if (supportsCreateImageBitmap) {
      // Декодируем только для получения размеров (без resize)
      const probe = await createImageBitmap(file);
      srcWidth = probe.width;
      srcHeight = probe.height;
      probe.close();
    } else {
      // Fallback: загружаем через HTMLImageElement для получения размеров
      objectUrl = URL.createObjectURL(file);
      const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error('Could not probe image dimensions'));
        img.src = objectUrl!;
      });
      srcWidth = dims.width;
      srcHeight = dims.height;
      // objectUrl понадобится дальше для HTMLCanvas fallback
    }

    const { width, height } = computeDimensions(srcWidth, srcHeight, maxWidth, maxHeight);

    // ── 4. Сжатие ────────────────────────────────────────────────────────────
    let blob: Blob;

    if (useOffscreen && supportsCreateImageBitmap) {
      try {
        blob = await compressViaOffscreenCanvas(file, width, height, outputFormat, quality);
      } catch (offscreenErr) {
        // OffscreenCanvas может упасть при нехватке памяти или CORS-проблемах
        // Логируем деградацию и переходим на fallback
        logger.warn('[imageCompressor] OffscreenCanvas failed, falling back to HTMLCanvas', { error: offscreenErr });
        useOffscreen = false;

        if (!objectUrl) {
          objectUrl = URL.createObjectURL(file);
        }
        blob = await compressViaHTMLCanvas(objectUrl, width, height, outputFormat, quality);
      }
    } else {
      // HTMLCanvas fallback
      if (!objectUrl) {
        objectUrl = URL.createObjectURL(file);
      }
      blob = await compressViaHTMLCanvas(objectUrl, width, height, outputFormat, quality);
    }

    const compressedFile = blobToFile(blob, file.name, outputFormat);

    return {
      file: compressedFile,
      originalSize,
      compressedSize: compressedFile.size,
      width,
      height,
      wasCompressed: true,
    };
  } finally {
    // Всегда освобождаем объектный URL во избежание утечки памяти
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}
