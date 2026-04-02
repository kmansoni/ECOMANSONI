/**
 * useReelsAlign — выравнивание кадра по предыдущему клипу при записи Reels.
 *
 * Аналог Instagram Align: полупрозрачное наложение последнего кадра
 * предыдущего клипа для точного совмещения при переходах.
 *
 * Возвращает:
 *  - previousFrame: ImageBitmap | null
 *  - captureFrame(video) — сохранить текущий кадр как референс
 *  - overlayOpacity: number (0-1)
 *  - setOverlayOpacity(n) — изменить прозрачность
 *  - isAligning: boolean
 *  - startAlign() / stopAlign()
 *  - clearFrame() — очистить сохранённый кадр
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { logger } from "@/lib/logger";

export function useReelsAlign() {
  const [previousFrame, setPreviousFrame] = useState<ImageBitmap | null>(null);
  const [overlayOpacity, setOverlayOpacity] = useState(0.3);
  const [isAligning, setIsAligning] = useState(false);
  const canvasRef = useRef<OffscreenCanvas | null>(null);

  // Cleanup при размонтировании
  useEffect(() => {
    return () => {
      previousFrame?.close();
    };
  }, [previousFrame]);

  const captureFrame = useCallback(async (video: HTMLVideoElement) => {
    if (!video || video.readyState < 2) {
      logger.warn("[useReelsAlign] Видео не готово для захвата кадра");
      return;
    }

    try {
      const width = video.videoWidth || video.clientWidth;
      const height = video.videoHeight || video.clientHeight;

      if (!canvasRef.current || canvasRef.current.width !== width || canvasRef.current.height !== height) {
        canvasRef.current = new OffscreenCanvas(width, height);
      }

      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) {
        logger.error("[useReelsAlign] Не удалось получить контекст OffscreenCanvas");
        return;
      }

      ctx.drawImage(video, 0, 0, width, height);
      const blob = await canvasRef.current.convertToBlob({ type: "image/jpeg", quality: 0.85 });
      const bitmap = await createImageBitmap(blob);

      // Освобождаем предыдущий
      previousFrame?.close();
      setPreviousFrame(bitmap);
      logger.debug("[useReelsAlign] Кадр захвачен", { width, height });
    } catch (err) {
      logger.error("[useReelsAlign] Ошибка захвата кадра", { error: err });
    }
  }, [previousFrame]);

  const startAlign = useCallback(() => {
    if (!previousFrame) {
      logger.warn("[useReelsAlign] Нет сохранённого кадра для выравнивания");
      return;
    }
    setIsAligning(true);
  }, [previousFrame]);

  const stopAlign = useCallback(() => {
    setIsAligning(false);
  }, []);

  const clearFrame = useCallback(() => {
    previousFrame?.close();
    setPreviousFrame(null);
    setIsAligning(false);
  }, [previousFrame]);

  const handleSetOverlayOpacity = useCallback((value: number) => {
    setOverlayOpacity(Math.min(1, Math.max(0, value)));
  }, []);

  return {
    previousFrame,
    captureFrame,
    overlayOpacity,
    setOverlayOpacity: handleSetOverlayOpacity,
    isAligning,
    startAlign,
    stopAlign,
    clearFrame,
  } as const;
}
