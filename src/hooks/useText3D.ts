/**
 * useText3D — управление 3D-текстом для Stories.
 *
 * Возвращает:
 *  - config: Text3DConfig — текущая конфигурация
 *  - updateConfig(partial) — обновить конфигурацию
 *  - renderToCanvas(canvas) — отрисовать 3D текст на canvas
 *  - colorPresets — палитра цветов
 */

import { useState, useCallback, useRef } from "react";
import { logger } from "@/lib/logger";

export interface Text3DConfig {
  text: string;
  color: string;
  depth: number;
  rotation: { x: number; y: number; z: number };
  fontSize: number;
  fontWeight: "normal" | "bold";
}

const DEFAULT_CONFIG: Text3DConfig = {
  text: "Привет!",
  color: "#ffffff",
  depth: 5,
  rotation: { x: 0, y: 0, z: 0 },
  fontSize: 48,
  fontWeight: "bold",
};

export const COLOR_PRESETS = [
  "#ffffff", "#ff3b5c", "#ff9500", "#ffcc00",
  "#34c759", "#007aff", "#af52de", "#ff2d55",
  "#5856d6", "#00c7be", "#ff6b6b", "#1a1a2e",
] as const;

export function useText3D(initial?: Partial<Text3DConfig>) {
  const [config, setConfig] = useState<Text3DConfig>({ ...DEFAULT_CONFIG, ...initial });
  const lastRenderRef = useRef<number>(0);

  const updateConfig = useCallback((partial: Partial<Text3DConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...partial };
      if (partial.rotation) {
        next.rotation = { ...prev.rotation, ...partial.rotation };
      }
      // Clamp значений
      next.depth = Math.min(10, Math.max(1, next.depth));
      next.fontSize = Math.min(120, Math.max(12, next.fontSize));
      return next;
    });
  }, []);

  const renderToCanvas = useCallback(
    (canvas: HTMLCanvasElement) => {
      const now = performance.now();
      // Throttle рендеринга: не чаще чем раз в 16ms (~60fps)
      if (now - lastRenderRef.current < 16) return;
      lastRenderRef.current = now;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        logger.error("[useText3D] Не удалось получить 2D контекст canvas");
        return;
      }

      const { text, color, depth, rotation, fontSize, fontWeight } = config;
      const dpr = window.devicePixelRatio || 1;

      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

      ctx.save();
      ctx.translate(canvas.clientWidth / 2, canvas.clientHeight / 2);

      // Имитация 3D-перспективы через смещение
      const radX = (rotation.x * Math.PI) / 180;
      const radY = (rotation.y * Math.PI) / 180;
      const scaleY = Math.cos(radX);
      const skewX = Math.sin(radY) * 0.3;

      ctx.transform(1, 0, skewX, scaleY, 0, 0);

      ctx.font = `${fontWeight} ${fontSize}px "Inter", "SF Pro", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Каскадные тени для глубины (от дальних к ближним)
      const depthLayers = Math.round(depth);
      for (let i = depthLayers; i >= 1; i--) {
        const shade = Math.max(0, 40 - i * 4);
        ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${0.6 - i * 0.04})`;
        ctx.fillText(text, i * 1.2, i * 1.2);
      }

      // Основной текст
      ctx.fillStyle = color;
      ctx.fillText(text, 0, 0);

      // Блик сверху (для объёмности)
      const gradient = ctx.createLinearGradient(0, -fontSize / 2, 0, fontSize / 4);
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.35)");
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = gradient;
      ctx.fillText(text, 0, 0);

      ctx.restore();
    },
    [config],
  );

  return { config, updateConfig, renderToCanvas, colorPresets: COLOR_PRESETS } as const;
}
