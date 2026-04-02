/**
 * @file src/lib/applyImageFilter.ts
 * @description Применение Instagram-фильтров и ручных adjustments к изображению через Canvas API.
 *
 * Решает критический баг S2: фильтры были CSS-only, а файл загружался без обработки.
 * Теперь перед загрузкой изображение рисуется на canvas с filter + overlay,
 * и результат экспортируется как Blob.
 */

import { FILTERS } from "@/components/editor/photoFiltersModel";
import { type Adjustments, DEFAULT_ADJUSTMENTS } from "@/components/editor/adjustmentsModel";
import { logger } from "@/lib/logger";

interface ApplyFilterOptions {
  filterIdx: number;
  filterIntensity: number;
  adjustments: Adjustments;
}

function buildAdjustmentsFilter(adj: Adjustments): string {
  const brightness = 1 + adj.brightness / 100;
  const contrast = 1 + adj.contrast / 100;
  const saturate = 1 + adj.saturation / 100;
  const hueRotate = adj.warmth * 0.5;
  const shadowAdj = 1 + adj.shadows / 200;
  const highlightAdj = 1 + adj.highlights / 200;
  const totalBrightness = brightness * shadowAdj * highlightAdj;

  return [
    `brightness(${totalBrightness.toFixed(2)})`,
    `contrast(${contrast.toFixed(2)})`,
    `saturate(${saturate.toFixed(2)})`,
    adj.warmth !== 0 ? `hue-rotate(${hueRotate.toFixed(0)}deg)` : "",
    adj.sharpness > 0 ? `drop-shadow(0 0 ${(adj.sharpness / 100).toFixed(2)}px rgba(0,0,0,0.5))` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function interpolateFilter(filterCSS: string, intensity: number): string {
  if (intensity >= 1) return filterCSS;
  if (intensity <= 0 || !filterCSS) return "";

  // Парсим отдельные функции фильтра и интерполируем к нейтральным значениям
  return filterCSS.replace(
    /(brightness|contrast|saturate|sepia|grayscale|hue-rotate)\(([^)]+)\)/g,
    (_, fn, val) => {
      const num = parseFloat(val);
      if (fn === "hue-rotate") {
        return `hue-rotate(${(num * intensity).toFixed(1)}deg)`;
      }
      // Нейтральное значение: 1 для brightness/contrast/saturate, 0 для sepia/grayscale
      const neutral = fn === "sepia" || fn === "grayscale" ? 0 : 1;
      const interpolated = neutral + (num - neutral) * intensity;
      return `${fn}(${interpolated.toFixed(3)})`;
    },
  );
}

function isDefaultAdjustments(adj: Adjustments): boolean {
  return (
    adj.brightness === 0 &&
    adj.contrast === 0 &&
    adj.saturation === 0 &&
    adj.warmth === 0 &&
    adj.shadows === 0 &&
    adj.highlights === 0 &&
    adj.vignette === 0 &&
    adj.sharpness === 0 &&
    adj.grain === 0
  );
}

/**
 * Применяет фильтр и adjustments к изображению через canvas.
 * Если фильтр "Оригинал" (idx=0) и adjustments дефолтные — возвращает исходный file.
 */
export async function applyImageFilter(
  file: File,
  options: ApplyFilterOptions,
): Promise<File> {
  const { filterIdx, filterIntensity, adjustments } = options;

  // Быстрый путь: ничего не применять
  const isOriginalFilter = filterIdx === 0 || filterIntensity <= 0;
  const isDefaultAdj = isDefaultAdjustments(adjustments);
  if (isOriginalFilter && isDefaultAdj) {
    return file;
  }

  // Не обрабатываем видео
  if (file.type.startsWith("video/")) {
    return file;
  }

  try {
    const img = await loadImage(file);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      logger.error("[applyImageFilter] Canvas 2d context not available");
      return file;
    }

    // Собираем CSS filter string
    const filter = FILTERS[filterIdx] ?? FILTERS[0];
    const filterCSS = isOriginalFilter
      ? ""
      : interpolateFilter(String(filter.style.filter ?? ""), filterIntensity);
    const adjCSS = isDefaultAdj ? "" : buildAdjustmentsFilter(adjustments);
    const combinedFilter = [filterCSS, adjCSS].filter(Boolean).join(" ");

    if (combinedFilter) {
      ctx.filter = combinedFilter;
    }

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Сбрасываем filter для overlay
    ctx.filter = "none";

    // Overlay (цветное наложение как у Instagram)
    if (!isOriginalFilter && filter.overlay && filterIntensity > 0) {
      ctx.globalAlpha = filter.overlay.opacity * filterIntensity;
      ctx.globalCompositeOperation = filter.overlay.blendMode as GlobalCompositeOperation;
      ctx.fillStyle = filter.overlay.color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }

    // Виньетка (radial gradient)
    if (adjustments.vignette > 0) {
      const vStrength = adjustments.vignette / 100;
      const gradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2,
        canvas.width * 0.3,
        canvas.width / 2, canvas.height / 2,
        canvas.width * 0.7,
      );
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(1, `rgba(0,0,0,${(vStrength * 0.6).toFixed(2)})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const blob = await canvasToBlob(canvas, file.type || "image/jpeg", 0.92);
    return new File([blob], file.name, { type: blob.type, lastModified: Date.now() });
  } catch (err) {
    logger.error("[applyImageFilter] Failed to apply filter", { error: err });
    return file;
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob returned null"));
      },
      type === "image/png" ? "image/png" : "image/jpeg",
      quality,
    );
  });
}
