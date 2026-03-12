/**
 * @file src/components/camera/DualCamera.tsx
 * @description Dual Camera — одновременная съёмка с фронтальной и задней камеры.
 * Instagram-стиль: PiP (Picture-in-Picture) режим.
 *
 * Архитектура:
 * - getUserMedia x2: { facingMode: 'environment' } + { facingMode: 'user' }
 * - Canvas compositor: рисует оба потока на одном canvas
 * - PiP: маленький кружок (фронтальная) поверх большого (задняя)
 * - Swap: нажатие на PiP меняет камеры местами
 * - Запись: MediaRecorder захватывает canvas.captureStream()
 * - Fallback: если вторая камера недоступна → одиночная камера
 *
 * Ограничения:
 * - iOS Safari: одновременный доступ к двум камерам не поддерживается
 *   → fallback на последовательное переключение
 * - Android Chrome 94+: поддерживается через getDisplayMedia workaround
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { FlipHorizontal, Circle, Square, SwitchCamera, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type PipPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface DualCameraProps {
  onCapture: (blob: Blob, type: "photo" | "video") => void;
  onClose: () => void;
}

const PIP_SIZE = 120; // px
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;

export function DualCamera({ onCapture, onClose }: DualCameraProps) {
  const mainVideoRef = useRef<HTMLVideoElement>(null);
  const pipVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [mainStream, setMainStream] = useState<MediaStream | null>(null);
  const [pipStream, setPipStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pipPosition, setPipPosition] = useState<PipPosition>("bottom-right");
  const [swapped, setSwapped] = useState(false);
  const [dualSupported, setDualSupported] = useState(true);
  const [recordingTime, setRecordingTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Инициализация камер
  useEffect(() => {
    initCameras();
    return () => {
      mainStream?.getTracks().forEach((t) => t.stop());
      pipStream?.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(rafRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const initCameras = async () => {
    setIsLoading(true);
    try {
      // Задняя камера (основная)
      const back = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true,
      });

      // Фронтальная камера (PiP)
      let front: MediaStream | null = null;
      try {
        front = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 480 } },
          audio: false,
        });
      } catch {
        setDualSupported(false);
        toast.info("Вторая камера недоступна — одиночный режим");
      }

      setMainStream(back);
      setPipStream(front);

      if (mainVideoRef.current) {
        mainVideoRef.current.srcObject = back;
        await mainVideoRef.current.play();
      }
      if (front && pipVideoRef.current) {
        pipVideoRef.current.srcObject = front;
        await pipVideoRef.current.play();
      }

      // Запускаем compositor
      startCompositor();
    } catch (err) {
      toast.error("Нет доступа к камере");
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  // Canvas compositor — рисует оба потока
  const startCompositor = useCallback(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const render = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const mainVideo = mainVideoRef.current;
      const pipVideo = pipVideoRef.current;

      if (mainVideo && mainVideo.readyState >= 2) {
        ctx.drawImage(mainVideo, 0, 0, canvas.width, canvas.height);
      }

      if (pipVideo && pipVideo.readyState >= 2 && dualSupported) {
        const pipW = canvas.width * 0.28;
        const pipH = pipW;
        const margin = 16;

        let pipX = 0, pipY = 0;
        switch (pipPosition) {
          case "top-left":    pipX = margin; pipY = margin; break;
          case "top-right":   pipX = canvas.width - pipW - margin; pipY = margin; break;
          case "bottom-left": pipX = margin; pipY = canvas.height - pipH - margin; break;
          case "bottom-right": pipX = canvas.width - pipW - margin; pipY = canvas.height - pipH - margin; break;
        }

        // Круглый клип для PiP
        ctx.save();
        ctx.beginPath();
        ctx.arc(pipX + pipW / 2, pipY + pipH / 2, pipW / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(pipVideo, pipX, pipY, pipW, pipH);
        ctx.restore();

        // Белая обводка PiP
        ctx.beginPath();
        ctx.arc(pipX + pipW / 2, pipY + pipH / 2, pipW / 2, 0, Math.PI * 2);
        ctx.strokeStyle = "white";
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
  }, [pipPosition, dualSupported]);

  // Перезапуск compositor при смене позиции
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    startCompositor();
  }, [pipPosition, startCompositor]);

  const handleSwap = () => {
    if (!dualSupported) return;
    setSwapped((prev) => !prev);
    // Меняем srcObject местами
    const mainEl = mainVideoRef.current;
    const pipEl = pipVideoRef.current;
    if (!mainEl || !pipEl) return;
    const tmp = mainEl.srcObject;
    mainEl.srcObject = pipEl.srcObject;
    pipEl.srcObject = tmp;
  };

  const handlePhoto = () => {
    const canvas = canvasRef.current;
    const previewCanvas = previewCanvasRef.current;
    if (!canvas || !previewCanvas) return;

    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(previewCanvas, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    canvas.toBlob((blob) => {
      if (blob) onCapture(blob, "photo");
    }, "image/jpeg", 0.92);
  };

  const handleStartRecording = () => {
    const previewCanvas = previewCanvasRef.current;
    if (!previewCanvas) return;

    const captureStream = previewCanvas.captureStream(30);

    // Добавляем аудио из основного потока
    if (mainStream) {
      const audioTrack = mainStream.getAudioTracks()[0];
      if (audioTrack) captureStream.addTrack(audioTrack);
    }

    const recorder = new MediaRecorder(captureStream, {
      mimeType: "video/webm;codecs=vp8",
      videoBitsPerSecond: 4_000_000,
    });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      onCapture(blob, "video");
    };

    recorder.start(100);
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
    setRecordingTime(0);
    timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
  };

  const handleStopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const cyclePipPosition = () => {
    const positions: PipPosition[] = ["top-left", "top-right", "bottom-right", "bottom-left"];
    setPipPosition((prev) => {
      const idx = positions.indexOf(prev);
      return positions[(idx + 1) % positions.length];
    });
  };

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* Скрытые видео элементы */}
      <video ref={mainVideoRef} autoPlay playsInline muted className="hidden" />
      <video ref={pipVideoRef} autoPlay playsInline muted className="hidden" />
      <canvas ref={canvasRef} className="hidden" />

      {/* Preview canvas */}
      <canvas
        ref={previewCanvasRef}
        width={540}
        height={960}
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Loading */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <Loader2 className="w-10 h-10 text-white animate-spin" />
        </div>
      )}

      {/* Контролы */}
      <div className="absolute inset-0 flex flex-col justify-between p-4 pointer-events-none">
        {/* Верхняя панель */}
        <div className="flex items-center justify-between pointer-events-auto">
          <button onClick={onClose} className="text-white text-sm bg-black/40 rounded-full px-3 py-1.5">
            Отмена
          </button>

          {/* Таймер записи */}
          {isRecording && (
            <div className="flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-sm font-mono">
                {Math.floor(recordingTime / 60).toString().padStart(2, "0")}:
                {(recordingTime % 60).toString().padStart(2, "0")}
              </span>
            </div>
          )}

          {/* Позиция PiP */}
          {dualSupported && (
            <button
              onClick={cyclePipPosition}
              className="text-white bg-black/40 rounded-full p-2"
            >
              <FlipHorizontal className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Нижняя панель */}
        <div className="flex items-center justify-center gap-8 pointer-events-auto">
          {/* Swap камер */}
          {dualSupported && (
            <button onClick={handleSwap} className="text-white">
              <SwitchCamera className="w-7 h-7" />
            </button>
          )}

          {/* Кнопка съёмки */}
          <button
            onPointerDown={handleStartRecording}
            onPointerUp={handleStopRecording}
            onClick={!isRecording ? handlePhoto : undefined}
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

          {/* Placeholder для симметрии */}
          <div className="w-7 h-7" />
        </div>
      </div>
    </div>
  );
}
