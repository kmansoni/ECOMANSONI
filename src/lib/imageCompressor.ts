import { logger } from './logger';

export interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  outputFormat?: 'image/jpeg' | 'image/webp';
  skipBelowBytes?: number;
}

export interface CompressResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
  wasCompressed: boolean;
}

// ─── Presets ──────────────────────────────────────────────────────────────────

export const COMPRESS_PRESETS = {
  post: { maxWidth: 1440, maxHeight: 1800, quality: 0.92, outputFormat: 'image/jpeg' as const },
  story: { maxWidth: 1080, maxHeight: 1920, quality: 0.90, outputFormat: 'image/jpeg' as const },
  avatar: { maxWidth: 512, maxHeight: 512, quality: 0.90, outputFormat: 'image/jpeg' as const },
  chat: { maxWidth: 1920, maxHeight: 1920, quality: 0.82, outputFormat: 'image/jpeg' as const },
  thumbnail: { maxWidth: 480, maxHeight: 480, quality: 0.80, outputFormat: 'image/jpeg' as const },
} as const;

const DEFAULT_MAX_WIDTH = 2048;
const DEFAULT_MAX_HEIGHT = 2048;
const DEFAULT_QUALITY = 0.85;
const DEFAULT_OUTPUT_FORMAT = 'image/jpeg' as const;
const DEFAULT_SKIP_BELOW_BYTES = 512_000;

// GIF — потеря анимации, SVG — потеря векторности, WebP — уже сжат
const NON_COMPRESSIBLE_TYPES = new Set([
  'image/gif',
  'image/svg+xml',
  'image/webp',
]);

export function isCompressibleImage(file: File): boolean {
  if (!file.type.startsWith('image/')) return false;
  return !NON_COMPRESSIBLE_TYPES.has(file.type);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

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

function blobToFile(blob: Blob, originalName: string, outputFormat: string): File {
  const ext = outputFormat === 'image/webp' ? 'webp' : 'jpg';
  const baseName = originalName.replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}.${ext}`, { type: outputFormat });
}

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

// ─── OffscreenCanvas path (non-blocking) ────────────────────────────────────

async function compressViaOffscreenCanvas(
  file: File,
  width: number,
  height: number,
  outputFormat: string,
  quality: number,
): Promise<Blob> {
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
    bitmap.close();
  }
}

// ─── HTMLCanvas fallback ────────────────────────────────────────────────────

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

    img.src = objectUrl;
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

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

  if (!isCompressibleImage(file)) {
    return { file, originalSize, compressedSize: originalSize, width: 0, height: 0, wasCompressed: false };
  }

  if (originalSize < skipBelowBytes) {
    return { file, originalSize, compressedSize: originalSize, width: 0, height: 0, wasCompressed: false };
  }

  let srcWidth: number;
  let srcHeight: number;
  let useOffscreen = typeof OffscreenCanvas !== 'undefined';
  const supportsCreateImageBitmap = typeof createImageBitmap !== 'undefined';
  let objectUrl: string | null = null;

  try {
    if (supportsCreateImageBitmap) {
      const probe = await createImageBitmap(file);
      srcWidth = probe.width;
      srcHeight = probe.height;
      probe.close();
    } else {
      objectUrl = URL.createObjectURL(file);
      const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error('Could not probe image dimensions'));
        img.src = objectUrl!;
      });
      srcWidth = dims.width;
      srcHeight = dims.height;
    }

    const { width, height } = computeDimensions(srcWidth, srcHeight, maxWidth, maxHeight);

    let blob: Blob;

    if (useOffscreen && supportsCreateImageBitmap) {
      try {
        blob = await compressViaOffscreenCanvas(file, width, height, outputFormat, quality);
      } catch (offscreenErr) {
        logger.warn('[imageCompressor] OffscreenCanvas failed, falling back to HTMLCanvas', { error: offscreenErr });
        useOffscreen = false;
        if (!objectUrl) objectUrl = URL.createObjectURL(file);
        blob = await compressViaHTMLCanvas(objectUrl, width, height, outputFormat, quality);
      }
    } else {
      if (!objectUrl) objectUrl = URL.createObjectURL(file);
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
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
