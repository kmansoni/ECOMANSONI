/**
 * Размытие фона видео в звонках через BodyPix сегментацию.
 * Использует существующие функции из src/lib/ar/backgroundSegmentation.ts:
 *   - loadSegmentationModel() — загрузка TF.js BodyPix
 *   - segmentPerson(video) — сегментация человека
 *   - applyBackgroundBlur(canvas, mask, blur) — наложение blur на фон
 *
 * Архитектура: hidden <video> → requestAnimationFrame loop → canvas → captureStream
 */

import { logger } from '@/lib/logger';
import {
  loadSegmentationModel,
  segmentPerson,
  applyBackgroundBlur,
} from '@/lib/ar/backgroundSegmentation';

const TARGET_FPS = 20;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

export class VideoBlurProcessor {
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private rafId: number | null = null;
  private running = false;
  private blurAmount = 15;
  private lastFrameTime = 0;

  /**
   * Запускает обработку: сегментация + blur на каждом кадре.
   * @param sourceTrack — исходный video track с камеры
   * @returns обработанный MediaStreamTrack из canvas
   */
  async start(sourceTrack: MediaStreamTrack): Promise<MediaStreamTrack> {
    if (this.running) this.stop();

    // 1. Загрузить модель сегментации (lazy, повторный вызов — no-op)
    const modelReady = await loadSegmentationModel();
    if (!modelReady) {
      throw new Error('Не удалось загрузить модель сегментации (BodyPix)');
    }

    // 2. Создать hidden video с source track
    this.video = document.createElement('video');
    this.video.srcObject = new MediaStream([sourceTrack]);
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.style.position = 'fixed';
    this.video.style.top = '-9999px';
    this.video.style.left = '-9999px';
    this.video.style.width = '1px';
    this.video.style.height = '1px';
    this.video.style.opacity = '0';
    this.video.style.pointerEvents = 'none';
    document.body.appendChild(this.video);

    await this.video.play().catch((err) => {
      logger.warn('[VideoBlurProcessor] video.play() ошибка', { error: err });
    });

    // 3. Canvas для рендеринга
    const settings = sourceTrack.getSettings();
    const width = settings.width ?? 640;
    const height = settings.height ?? 480;

    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Не удалось получить 2D контекст canvas');
    this.ctx = ctx;

    // 4. Запуск rAF-цикла
    this.running = true;
    this.processFrame();

    // 5. Возвращаем трек из canvas captureStream
    const outputStream = this.canvas.captureStream(TARGET_FPS);
    const outputTrack = outputStream.getVideoTracks()[0];
    if (!outputTrack) throw new Error('Не удалось получить трек из canvas');

    logger.info('[VideoBlurProcessor] Обработка запущена', {
      width,
      height,
      fps: TARGET_FPS,
      blurAmount: this.blurAmount,
    });

    return outputTrack;
  }

  private processFrame = (): void => {
    if (!this.running) return;

    const now = performance.now();
    if (now - this.lastFrameTime < FRAME_INTERVAL) {
      this.rafId = requestAnimationFrame(this.processFrame);
      return;
    }
    this.lastFrameTime = now;

    void this.renderFrame().then(() => {
      if (this.running) {
        this.rafId = requestAnimationFrame(this.processFrame);
      }
    });
  };

  private async renderFrame(): Promise<void> {
    if (!this.video || !this.canvas || !this.ctx) return;
    if (this.video.readyState < 2) return;

    try {
      // Рисуем текущий кадр видео на canvas
      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

      // Сегментация человека
      const mask = await segmentPerson(this.video);
      if (!mask) return;

      // Применяем blur к фону
      applyBackgroundBlur(this.canvas, mask, this.blurAmount);
    } catch (error) {
      logger.warn('[VideoBlurProcessor] Ошибка обработки кадра', { error });
    }
  }

  /** Остановить обработку и освободить ресурсы. */
  stop(): void {
    this.running = false;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video.remove();
      this.video = null;
    }

    this.canvas = null;
    this.ctx = null;

    logger.info('[VideoBlurProcessor] Обработка остановлена');
  }

  /** Установить степень размытия (0–30). */
  setBlurAmount(amount: number): void {
    this.blurAmount = Math.max(0, Math.min(30, amount));
  }
}
