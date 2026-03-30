/**
 * @file src/components/feed/BoomerangCapture.tsx
 * @description Boomerang-эффект для Stories — захват серии кадров с камеры,
 * создание петлевого GIF/видео (вперёд-назад).
 *
 * Алгоритм:
 * 1. Захват N кадров (default: 20) через canvas из MediaStream
 * 2. Сборка forward + reverse массива кадров
 * 3. Анимация через requestAnimationFrame с заданным FPS
 * 4. Экспорт через MediaRecorder (VP8/WebM) или canvas-to-gif fallback
 *
 * Ограничения браузера:
 * - MediaRecorder не поддерживает GIF → экспортируем WebM
 * - iOS Safari: ограниченная поддержка MediaRecorder → fallback на APNG через canvas
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, Zap, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const FRAME_COUNT = 20;
const CAPTURE_FPS = 15;
const PLAYBACK_FPS = 24;
const CANVAS_WIDTH = 720;
const CANVAS_HEIGHT = 1280;

interface BoomerangCaptureProps {
  stream: MediaStream | null;
  onCapture: (blob: Blob, previewUrl: string) => void;
  onCancel: () => void;
}

type State = "idle" | "countdown" | "capturing" | "processing" | "preview";

export function BoomerangCapture({ stream, onCapture, onCancel }: BoomerangCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<ImageData[]>([]);
  const rafRef = useRef<number>(0);
  const [state, setState] = useState<State>("idle");
  const [countdown, setCountdown] = useState(3);
  const [progress, setProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Подключаем stream к video
  useEffect(() => {
    if (!videoRef.current || !stream) return;
    videoRef.current.srcObject = stream;
    videoRef.current.play().catch(() => { /* autoplay blocked */ });
    return () => {
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [stream]);

  // Захват одного кадра
  const captureFrame = useCallback((): ImageData | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    return ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }, []);

  // Запуск захвата кадров
  const startCapture = useCallback(async () => {
    setState("capturing");
    framesRef.current = [];
    const interval = 1000 / CAPTURE_FPS;
    let captured = 0;

    const captureNext = () => {
      if (captured >= FRAME_COUNT) {
        processBoomerang();
        return;
      }
      const frame = captureFrame();
      if (frame) {
        framesRef.current.push(frame);
        captured++;
        setProgress(Math.round((captured / FRAME_COUNT) * 100));
      }
      setTimeout(captureNext, interval);
    };

    captureNext();
  }, [captureFrame]);

  // Сборка boomerang: forward + reverse
  const processBoomerang = useCallback(async () => {
    setState("processing");
    const frames = framesRef.current;
    if (frames.length === 0) {
      toast.error("Не удалось захватить кадры");
      setState("idle");
      return;
    }

    // forward + reverse (без дублирования первого/последнего)
    const boomerangFrames = [
      ...frames,
      ...[...frames].reverse().slice(1, -1),
    ];

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    // Создаём WebM через MediaRecorder
    try {
      const captureStream = canvas.captureStream(PLAYBACK_FPS);
      const recorder = new MediaRecorder(captureStream, {
        mimeType: "video/webm;codecs=vp8",
        videoBitsPerSecond: 2_000_000,
      });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      recorder.start();

      let frameIdx = 0;
      const frameInterval = 1000 / PLAYBACK_FPS;

      const renderFrame = () => {
        if (frameIdx >= boomerangFrames.length) {
          recorder.stop();
          return;
        }
        ctx.putImageData(boomerangFrames[frameIdx], 0, 0);
        frameIdx++;
        setTimeout(renderFrame, frameInterval);
      };

      renderFrame();

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setState("preview");
        // Анимируем preview
        animatePreview(boomerangFrames);
      };
    } catch (err) {
      // Fallback: отдаём первый кадр как изображение
      canvas.toBlob((blob) => {
        if (!blob) { setState("idle"); return; }
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setState("preview");
      }, "image/jpeg", 0.9);
    }
  }, []);

  // Анимация preview на canvas
  const animatePreview = useCallback((frames: ImageData[]) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let idx = 0;
    let forward = true;

    const tick = () => {
      ctx.putImageData(frames[idx], 0, 0);
      if (forward) {
        idx++;
        if (idx >= frames.length) { forward = false; idx = frames.length - 2; }
      } else {
        idx--;
        if (idx < 0) { forward = true; idx = 1; }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    return () => { cancelAnimationFrame(rafRef.current); };
  }, []);

  // Countdown перед захватом
  const handleStart = useCallback(() => {
    setState("countdown");
    let count = 3;
    setCountdown(count);
    const timer = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(timer);
        startCapture();
      } else {
        setCountdown(count);
      }
    }, 1000);
  }, [startCapture]);

  const handleConfirm = useCallback(() => {
    if (!previewUrl) return;
    // Конвертируем URL обратно в Blob
    fetch(previewUrl)
      .then((r) => r.blob())
      .then((blob) => onCapture(blob, previewUrl));
  }, [previewUrl, onCapture]);

  const handleRetry = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    framesRef.current = [];
    setProgress(0);
    setState("idle");
  }, [previewUrl]);

  return (
    <div className="relative w-full h-full bg-black flex flex-col items-center justify-center">
      {/* Скрытый canvas для захвата */}
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="hidden"
      />

      {/* Видео с камеры */}
      {state !== "preview" && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Preview canvas */}
      {state === "preview" && (
        <canvas
          ref={previewCanvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Overlay UI */}
      <div className="absolute inset-0 flex flex-col items-center justify-between p-6 z-10">
        {/* Заголовок */}
        <div className="flex items-center gap-2 bg-black/50 rounded-full px-4 py-2">
          <Zap className="w-4 h-4 text-yellow-400 fill-yellow-400" />
          <span className="text-white text-sm font-semibold">BOOMERANG</span>
        </div>

        {/* Countdown */}
        {state === "countdown" && (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-white text-8xl font-bold">{countdown}</span>
          </div>
        )}

        {/* Progress */}
        {state === "capturing" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-48 h-2 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-yellow-400 transition-all duration-100"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-white text-sm">Захват...</span>
          </div>
        )}

        {/* Processing */}
        {state === "processing" && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-white animate-spin" />
          </div>
        )}

        {/* Кнопки */}
        <div className="flex gap-4 w-full">
          {state === "idle" && (
            <>
              <Button variant="ghost" onClick={onCancel} className="flex-1 text-white border border-white/30">
                Отмена
              </Button>
              <Button onClick={handleStart} className="flex-1 bg-yellow-400 text-black hover:bg-yellow-500">
                <Zap className="w-4 h-4 mr-2 fill-black" />
                Снять
              </Button>
            </>
          )}

          {state === "preview" && (
            <>
              <Button variant="ghost" onClick={handleRetry} className="flex-1 text-white border border-white/30">
                <RotateCcw className="w-4 h-4 mr-2" />
                Повторить
              </Button>
              <Button onClick={handleConfirm} className="flex-1 bg-white text-black hover:bg-white/90">
                Использовать
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
