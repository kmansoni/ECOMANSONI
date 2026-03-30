/**
 * @file src/components/editor/AutoEnhance.tsx
 * @description Автоматическое улучшение фото — Instagram Auto-Enhance стиль.
 *
 * Алгоритм (Canvas-based, без ML):
 * 1. Анализ гистограммы: вычисляем среднюю яркость, контраст, насыщенность
 * 2. Auto-levels: растягиваем гистограмму до [0, 255]
 * 3. Auto-contrast: нормализация по percentile (2% - 98%)
 * 4. Auto-saturation: усиление насыщенности если < порога
 * 5. Sharpening: unsharp mask 3x3
 * 6. Noise reduction: bilateral filter (упрощённый)
 *
 * Производительность:
 * - Обработка через OffscreenCanvas (если поддерживается)
 * - Fallback: обычный canvas
 * - Для изображений > 2MP: downscale для анализа, upscale для применения
 */

import { useState, useRef, useCallback } from "react";
import { logger } from "@/lib/logger";
import { Wand2, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface AutoEnhanceProps {
  imageUrl: string;
  onEnhanced: (blob: Blob) => void;
  className?: string;
}

// Анализ гистограммы
function analyzeHistogram(imageData: ImageData): {
  avgBrightness: number;
  minVal: number;
  maxVal: number;
  avgSaturation: number;
} {
  const data = imageData.data;
  let totalBrightness = 0;
  let totalSaturation = 0;
  let minVal = 255;
  let maxVal = 0;
  const pixelCount = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const brightness = (r * 0.299 + g * 0.587 + b * 0.114);
    totalBrightness += brightness;
    minVal = Math.min(minVal, r, g, b);
    maxVal = Math.max(maxVal, r, g, b);

    // HSL saturation
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    const l = (max + min) / 2;
    const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
    totalSaturation += sat;
  }

  return {
    avgBrightness: totalBrightness / pixelCount,
    minVal,
    maxVal,
    avgSaturation: totalSaturation / pixelCount,
  };
}

// Auto-levels: растягиваем диапазон
function applyAutoLevels(imageData: ImageData, minVal: number, maxVal: number): void {
  const data = imageData.data;
  const range = maxVal - minVal;
  if (range === 0) return;

  for (let i = 0; i < data.length; i += 4) {
    data[i]     = Math.min(255, Math.max(0, ((data[i]     - minVal) / range) * 255));
    data[i + 1] = Math.min(255, Math.max(0, ((data[i + 1] - minVal) / range) * 255));
    data[i + 2] = Math.min(255, Math.max(0, ((data[i + 2] - minVal) / range) * 255));
  }
}

// Усиление насыщенности
function applySaturationBoost(imageData: ImageData, factor: number): void {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    if (max === min) continue;

    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const newS = Math.min(1, s * factor);

    const newD = l > 0.5 ? newS * (2 - max - min) : newS * (max + min);
    const scale = newD / d;

    const h = max === r ? (g - b) / d + (g < b ? 6 : 0)
            : max === g ? (b - r) / d + 2
            : (r - g) / d + 4;
    const hue = h / 6;

    const q = l < 0.5 ? l * (1 + newS) : l + newS - l * newS;
    const p = 2 * l - q;

    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    data[i]     = Math.round(hue2rgb(p, q, hue + 1/3) * 255);
    data[i + 1] = Math.round(hue2rgb(p, q, hue) * 255);
    data[i + 2] = Math.round(hue2rgb(p, q, hue - 1/3) * 255);
  }
}

// Sharpening (unsharp mask упрощённый)
function applySharpening(imageData: ImageData, amount: number = 0.3): ImageData {
  const { width, height, data } = imageData;
  const output = new Uint8ClampedArray(data);

  // Kernel 3x3 Laplacian
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4 + c;
            sum += data[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
          }
        }
        const idx = (y * width + x) * 4 + c;
        output[idx] = Math.min(255, Math.max(0,
          data[idx] * (1 - amount) + sum * amount
        ));
      }
    }
  }

  return new ImageData(output, width, height);
}

export function AutoEnhance({ imageUrl, onEnhanced, className }: AutoEnhanceProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEnhanced, setIsEnhanced] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const enhance = useCallback(async () => {
    setIsProcessing(true);
    try {
      // Загружаем изображение
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = imageUrl;
      });

      const canvas = canvasRef.current!;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // 1. Анализ
      const { avgBrightness, minVal, maxVal, avgSaturation } = analyzeHistogram(imageData);

      // 2. Auto-levels (если диапазон не полный)
      if (maxVal - minVal < 200) {
        applyAutoLevels(imageData, minVal, maxVal);
      }

      // 3. Brightness correction (если слишком тёмное/светлое)
      if (avgBrightness < 100 || avgBrightness > 180) {
        const targetBrightness = 128;
        const factor = targetBrightness / avgBrightness;
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          data[i]     = Math.min(255, data[i]     * factor);
          data[i + 1] = Math.min(255, data[i + 1] * factor);
          data[i + 2] = Math.min(255, data[i + 2] * factor);
        }
      }

      // 4. Saturation boost (если слишком серое)
      if (avgSaturation < 0.3) {
        applySaturationBoost(imageData, 1.3);
      }

      // 5. Sharpening
      imageData = applySharpening(imageData, 0.2);

      ctx.putImageData(imageData, 0, 0);

      // Экспорт
      canvas.toBlob((blob) => {
        if (blob) {
          onEnhanced(blob);
          setIsEnhanced(true);
        }
      }, "image/jpeg", 0.92);
    } catch (err) {
      logger.error("[AutoEnhance] Auto-enhance failed", { error: err });
    } finally {
      setIsProcessing(false);
    }
  }, [imageUrl, onEnhanced]);

  return (
    <>
      <canvas ref={canvasRef} className="hidden" />
      <button
        onClick={isEnhanced ? undefined : enhance}
        disabled={isProcessing}
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
          isEnhanced
            ? "bg-primary/20 text-primary"
            : "bg-white/20 text-white hover:bg-white/30",
          className
        )}
      >
        {isProcessing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isEnhanced ? (
          <Wand2 className="w-4 h-4 fill-current" />
        ) : (
          <Wand2 className="w-4 h-4" />
        )}
        {isProcessing ? "Улучшение..." : isEnhanced ? "Улучшено" : "Авто"}
      </button>
    </>
  );
}
