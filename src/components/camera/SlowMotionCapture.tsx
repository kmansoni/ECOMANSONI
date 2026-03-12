/**
 * @file src/components/camera/SlowMotionCapture.tsx
 * @description Slow Motion и Time-lapse съёмка.
 *
 * Slow Motion архитектура:
 * - Захват при высоком frameRate (120fps если поддерживается, иначе 60fps)
 * - Воспроизведение при нормальном frameRate (30fps) → эффект замедления
 * - MediaRecorder: захват при высоком fps
 * - Playback speed: video.playbackRate = 0.25 (4x slow) или 0.5 (2x slow)
 * - Экспорт: WebM с оригинальным fps, playbackRate метаданные
 *
 * Time-lapse архитектура:
 * - Захват кадров с интервалом (default: 1 кадр/сек)
 * - Сборка в видео через canvas + MediaRecorder при 30fps
 * - Результат: 30x ускорение (1 мин реального времени = 2 сек видео)
 * - Настройка интервала: 0.5с / 1с / 2с / 5с
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Zap, Clock, Square, Circle, Loader2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type CaptureMode = "slow_motion" | "time_lapse";
type SlowFactor = 2 | 4;
type TimeLapseInterval = 0.5 | 1 | 2 | 5;

interface SlowMotionCaptureProps {
  onCapture: (blob: Blob, mode: CaptureMode, metadata: Record<string, any>) => void;
  onClose: () => void;
}

export function SlowMotionCapture({ onCapture, onClose }: SlowMotionCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timelapseCaptureRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timelapseFramesRef = useRef<ImageData[]>([]);
  const rafRef = useRef<number>(0);

  const [mode, setMode] = useState<CaptureMode>("slow_motion");
  const [slowFactor, setSlowFactor] = useState<SlowFactor>(4);
  const [tlInterval, setTlInterval] = useState<TimeLapseInterval>(1);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [recordingTime, setRecordingTime] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [achievedFps, setAchievedFps] = useState(30);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    initCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(rafRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (timelapseCaptureRef.current) clearInterval(timelapseCaptureRef.current);
    };
  }, []);

  const initCamera = async () => {
    setIsLoading(true);
    try {
      // Пробуем 120fps, fallback 60fps, fallback 30fps
      let stream: MediaStream | null = null;
      const fpsOptions = [120, 60, 30];
      let actualFps = 30;

      for (const fps of fpsOptions) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: "environment",
              frameRate: { ideal: fps, min: 24 },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: mode === "slow_motion",
          });
          const track = stream.getVideoTracks()[0];
          const settings = track.getSettings();
          actualFps = settings.frameRate ?? fps;
          break;
        } catch {
          // Try next fps profile.
        }
      }

      if (!stream) throw new Error("Камера недоступна");

      setAchievedFps(actualFps);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      toast.error("Нет доступа к камере");
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Slow Motion ───────────────────────────────────────────

  const startSlowMotion = () => {
    const stream = streamRef.current;
    if (!stream) return;

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 8_000_000,
    });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      onCapture(blob, "slow_motion", {
        originalFps: achievedFps,
        playbackRate: 1 / slowFactor,
        slowFactor,
      });
    };

    recorder.start(100);
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
    setRecordingTime(0);
    timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
  };

  const stopSlowMotion = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  // ─── Time-lapse ────────────────────────────────────────────

  const startTimeLapse = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    canvas.width = 1920;
    canvas.height = 1080;
    timelapseFramesRef.current = [];
    setFrameCount(0);
    setIsRecording(true);
    setRecordingTime(0);

    timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);

    timelapseCaptureRef.current = setInterval(() => {
      const ctx = canvas.getContext("2d");
      if (!ctx || !video) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      timelapseFramesRef.current.push(frame);
      setFrameCount((c) => c + 1);
    }, tlInterval * 1000);
  };

  const stopTimeLapse = async () => {
    if (timelapseCaptureRef.current) clearInterval(timelapseCaptureRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);

    const frames = timelapseFramesRef.current;
    if (frames.length < 2) {
      toast.error("Слишком мало кадров");
      return;
    }

    // Собираем видео из кадров
    const canvas = canvasRef.current!;
    const captureStream = canvas.captureStream(30);
    const recorder = new MediaRecorder(captureStream, {
      mimeType: "video/webm",
      videoBitsPerSecond: 4_000_000,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      onCapture(blob, "time_lapse", {
        frameCount: frames.length,
        captureInterval: tlInterval,
        outputFps: 30,
        speedFactor: 30 * tlInterval,
      });
    };

    recorder.start();
    const ctx = canvas.getContext("2d")!;
    let idx = 0;
    const renderFrame = () => {
      if (idx >= frames.length) {
        recorder.stop();
        return;
      }
      ctx.putImageData(frames[idx], 0, 0);
      idx++;
      setTimeout(renderFrame, 1000 / 30);
    };
    renderFrame();
  };

  const handleRecord = () => {
    if (isRecording) {
      if (mode === "slow_motion") {
        stopSlowMotion();
      } else {
        stopTimeLapse();
      }
    } else {
      if (mode === "slow_motion") {
        startSlowMotion();
      } else {
        startTimeLapse();
      }
    }
  };

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <canvas ref={canvasRef} className="hidden" />

      {/* Превью камеры */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <Loader2 className="w-10 h-10 text-white animate-spin" />
        </div>
      )}

      <div className="absolute inset-0 flex flex-col justify-between p-4">
        {/* Верхняя панель */}
        <div className="flex items-center justify-between">
          <button onClick={onClose} className="text-white bg-black/40 rounded-full px-3 py-1.5 text-sm">
            Отмена
          </button>

          {/* Таймер */}
          {isRecording && (
            <div className="flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-sm font-mono">
                {Math.floor(recordingTime / 60).toString().padStart(2, "0")}:
                {(recordingTime % 60).toString().padStart(2, "0")}
              </span>
              {mode === "time_lapse" && (
                <span className="text-white/70 text-xs">{frameCount} кадров</span>
              )}
            </div>
          )}

          {/* FPS индикатор */}
          <div className="bg-black/40 rounded-full px-3 py-1.5">
            <span className="text-white text-xs">{achievedFps}fps</span>
          </div>
        </div>

        {/* Нижняя панель */}
        <div className="flex flex-col gap-4">
          {/* Переключатель режима */}
          {!isRecording && (
            <div className="flex justify-center gap-2">
              <button
                onClick={() => setMode("slow_motion")}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors",
                  mode === "slow_motion" ? "bg-white text-black" : "bg-white/20 text-white"
                )}
              >
                <Zap className="w-4 h-4" />
                Slow-Mo
              </button>
              <button
                onClick={() => setMode("time_lapse")}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors",
                  mode === "time_lapse" ? "bg-white text-black" : "bg-white/20 text-white"
                )}
              >
                <Clock className="w-4 h-4" />
                Time-lapse
              </button>
            </div>
          )}

          {/* Настройки режима */}
          {!isRecording && mode === "slow_motion" && (
            <div className="flex justify-center gap-2">
              {([2, 4] as SlowFactor[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setSlowFactor(f)}
                  className={cn(
                    "px-3 py-1 rounded-full text-sm transition-colors",
                    slowFactor === f ? "bg-yellow-400 text-black" : "bg-white/20 text-white"
                  )}
                >
                  {f}x замедление
                </button>
              ))}
            </div>
          )}

          {!isRecording && mode === "time_lapse" && (
            <div className="flex justify-center gap-2">
              {([0.5, 1, 2, 5] as TimeLapseInterval[]).map((i) => (
                <button
                  key={i}
                  onClick={() => setTlInterval(i)}
                  className={cn(
                    "px-3 py-1 rounded-full text-sm transition-colors",
                    tlInterval === i ? "bg-blue-400 text-black" : "bg-white/20 text-white"
                  )}
                >
                  {i}с
                </button>
              ))}
            </div>
          )}

          {/* Кнопка записи */}
          <div className="flex justify-center">
            <button
              onClick={handleRecord}
              className={cn(
                "w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-all",
                isRecording ? "bg-red-500 scale-90" : "bg-white/20"
              )}
            >
              {isRecording ? (
                <Square className="w-8 h-8 text-white fill-white" />
              ) : (
                <Circle className="w-8 h-8 text-white fill-white" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
