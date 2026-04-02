/**
 * useCallARMasks — AR маски для видеозвонков.
 *
 * Использует face-landmarks-detection из src/lib/ar/faceDetection.ts
 * для позиционирования масок поверх лица.
 *
 * Возвращает:
 *  - currentMask: MaskType
 *  - setMask(mask) — применить маску
 *  - availableMasks — список доступных масок
 *  - processFrame(video, canvas) — отрисовать маску
 *  - isModelLoaded — готова ли ML-модель
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { loadModel, detectFaces } from "@/lib/ar/faceDetection";
import type { DetectedFace } from "@/lib/ar/faceDetection";
import { logger } from "@/lib/logger";

export type MaskType =
  | "none"
  | "dog_ears"
  | "cat_ears"
  | "glasses"
  | "crown"
  | "mustache"
  | "devil_horns";

interface MaskMeta {
  type: MaskType;
  name: string;
  emoji: string;
}

export const AVAILABLE_MASKS: MaskMeta[] = [
  { type: "none", name: "Без маски", emoji: "🚫" },
  { type: "dog_ears", name: "Собачка", emoji: "🐶" },
  { type: "cat_ears", name: "Кошечка", emoji: "🐱" },
  { type: "glasses", name: "Очки", emoji: "🕶️" },
  { type: "crown", name: "Корона", emoji: "👑" },
  { type: "mustache", name: "Усы", emoji: "🥸" },
  { type: "devil_horns", name: "Рожки", emoji: "😈" },
];

function drawMaskOnFace(
  ctx: CanvasRenderingContext2D,
  face: DetectedFace,
  mask: MaskType,
) {
  const { boundingBox: box } = face;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  ctx.save();
  ctx.font = `${Math.round(box.width * 0.6)}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  switch (mask) {
    case "dog_ears": {
      const earSize = Math.round(box.width * 0.45);
      ctx.font = `${earSize}px serif`;
      ctx.fillText("🐶", cx, box.y - earSize * 0.1);
      break;
    }
    case "cat_ears": {
      const earSize = Math.round(box.width * 0.45);
      ctx.font = `${earSize}px serif`;
      ctx.fillText("🐱", cx, box.y - earSize * 0.1);
      break;
    }
    case "glasses": {
      const glassSize = Math.round(box.width * 0.5);
      ctx.font = `${glassSize}px serif`;
      ctx.fillText("🕶️", cx, cy - box.height * 0.08);
      break;
    }
    case "crown": {
      const crownSize = Math.round(box.width * 0.5);
      ctx.font = `${crownSize}px serif`;
      ctx.fillText("👑", cx, box.y - crownSize * 0.3);
      break;
    }
    case "mustache": {
      const mustacheSize = Math.round(box.width * 0.35);
      ctx.font = `${mustacheSize}px serif`;
      ctx.fillText("🥸", cx, cy + box.height * 0.15);
      break;
    }
    case "devil_horns": {
      const hornSize = Math.round(box.width * 0.45);
      ctx.font = `${hornSize}px serif`;
      ctx.fillText("😈", cx, box.y - hornSize * 0.25);
      break;
    }
    default:
      break;
  }

  ctx.restore();
}

export function useCallARMasks() {
  const [currentMask, setCurrentMask] = useState<MaskType>("none");
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const loadingRef = useRef(false);

  // Ленивая загрузка модели при выборе маски
  useEffect(() => {
    if (currentMask === "none" || isModelLoaded || loadingRef.current) return;
    loadingRef.current = true;

    loadModel()
      .then((ok) => {
        setIsModelLoaded(ok);
        if (!ok) {
          logger.warn("[useCallARMasks] Модель не загружена, маски будут работать по bounding box");
        }
      })
      .catch((err) => {
        logger.error("[useCallARMasks] Ошибка загрузки модели", { error: err });
      })
      .finally(() => {
        loadingRef.current = false;
      });
  }, [currentMask, isModelLoaded]);

  const setMask = useCallback((mask: MaskType) => {
    setCurrentMask(mask);
  }, []);

  const processFrame = useCallback(
    async (video: HTMLVideoElement, canvas: HTMLCanvasElement) => {
      if (currentMask === "none") return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = video.videoWidth || video.clientWidth;
      canvas.height = video.videoHeight || video.clientHeight;

      // Рисуем видеокадр
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      try {
        const faces = await detectFaces(video);
        for (const face of faces) {
          drawMaskOnFace(ctx, face, currentMask);
        }
      } catch (err) {
        logger.debug("[useCallARMasks] Ошибка детекции лиц", { error: err });
      }
    },
    [currentMask],
  );

  return {
    currentMask,
    setMask,
    availableMasks: AVAILABLE_MASKS,
    processFrame,
    isModelLoaded,
  } as const;
}
