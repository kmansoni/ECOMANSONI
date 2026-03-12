/**
 * @file src/components/reels/ReelRemix.tsx
 * @description Remix Reels — создание ответного Reel на существующий.
 * Оригинальный Reel отображается в split-screen рядом с новым.
 *
 * Архитектура:
 * - Split-screen: оригинал (левая/верхняя половина) + новый (правая/нижняя)
 * - Режимы: side-by-side (горизонтальный) | top-bottom (вертикальный)
 * - Оригинальное аудио: можно включить/выключить
 * - Запись нового клипа через CameraHost или выбор из галереи
 * - Финальный экспорт: MediaRecorder захватывает canvas с обоими видео
 * - Связь через reel_remixes таблицу
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Columns, Rows, Volume2, VolumeX, Camera, ImagePlus, X, Check } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type SplitMode = "side-by-side" | "top-bottom";

interface ReelRemixProps {
  originalReelId: string;
  originalVideoUrl: string;
  originalAudioUrl?: string;
  onComplete: (remixBlob: Blob) => void;
  onCancel: () => void;
}

export function ReelRemix({
  originalReelId,
  originalVideoUrl,
  onComplete,
  onCancel,
}: ReelRemixProps) {
  const { user } = useAuth();
  const originalVideoRef = useRef<HTMLVideoElement>(null);
  const newVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number>(0);

  const [splitMode, setSplitMode] = useState<SplitMode>("side-by-side");
  const [originalMuted, setOriginalMuted] = useState(false);
  const [newVideoFile, setNewVideoFile] = useState<File | null>(null);
  const [newVideoUrl, setNewVideoUrl] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [mode, setMode] = useState<"select" | "camera" | "preview">("select");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Загружаем оригинальное видео
  useEffect(() => {
    if (originalVideoRef.current) {
      originalVideoRef.current.src = originalVideoUrl;
      originalVideoRef.current.loop = true;
      originalVideoRef.current.muted = originalMuted;
    }
  }, [originalVideoUrl, originalMuted]);

  // Рендер split-screen на canvas
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const origVideo = originalVideoRef.current;
    const newVideo = newVideoRef.current;
    if (!canvas || !origVideo) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    if (splitMode === "side-by-side") {
      ctx.drawImage(origVideo, 0, 0, W / 2, H);
      if (newVideo && newVideoUrl) {
        ctx.drawImage(newVideo, W / 2, 0, W / 2, H);
      } else {
        ctx.fillStyle = "#111";
        ctx.fillRect(W / 2, 0, W / 2, H);
      }
    } else {
      ctx.drawImage(origVideo, 0, 0, W, H / 2);
      if (newVideo && newVideoUrl) {
        ctx.drawImage(newVideo, 0, H / 2, W, H / 2);
      } else {
        ctx.fillStyle = "#111";
        ctx.fillRect(0, H / 2, W, H / 2);
      }
    }

    rafRef.current = requestAnimationFrame(renderFrame);
  }, [splitMode, newVideoUrl]);

  useEffect(() => {
    if (mode === "preview") {
      canvasRef.current!.width = 720;
      canvasRef.current!.height = 1280;
      originalVideoRef.current?.play().catch(() => {});
      newVideoRef.current?.play().catch(() => {});
      rafRef.current = requestAnimationFrame(renderFrame);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [mode, renderFrame]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewVideoFile(file);
    const url = URL.createObjectURL(file);
    setNewVideoUrl(url);
    setMode("preview");
    e.target.value = "";
  };

  const startCameraRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 360, height: 640 },
        audio: true,
      });
      setCameraStream(stream);
      setMode("camera");
    } catch {
      toast.error("Нет доступа к камере");
    }
  };

  const stopCameraAndUse = () => {
    if (!cameraStream) return;
    const tracks = cameraStream.getTracks();
    // Создаём blob из stream через MediaRecorder
    const recorder = new MediaRecorder(cameraStream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      setNewVideoUrl(url);
      setNewVideoFile(new File([blob], "remix.webm", { type: "video/webm" }));
      tracks.forEach((t) => t.stop());
      setCameraStream(null);
      setMode("preview");
    };
    recorder.start();
    setTimeout(() => recorder.stop(), 100); // Захватываем текущий кадр
  };

  const handleExport = async () => {
    if (!newVideoFile || !user) return;
    setIsExporting(true);

    const canvas = canvasRef.current!;
    const captureStream = canvas.captureStream(30);
    const recorder = new MediaRecorder(captureStream, {
      mimeType: "video/webm;codecs=vp8",
      videoBitsPerSecond: 2_500_000,
    });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setIsExporting(false);
      onComplete(blob);
    };

    recorder.start();
    // Записываем длительность оригинального видео
    const duration = originalVideoRef.current?.duration ?? 15;
    setTimeout(() => recorder.stop(), duration * 1000);
  };

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Скрытые элементы */}
      <canvas ref={canvasRef} className="hidden" />
      <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileSelect} />

      {/* Видео элементы */}
      <video ref={originalVideoRef} className="hidden" playsInline muted={originalMuted} loop />
      {newVideoUrl && (
        <video ref={newVideoRef} src={newVideoUrl} className="hidden" playsInline muted loop />
      )}

      {/* Заголовок */}
      <div className="flex items-center justify-between px-4 py-3 z-10">
        <button onClick={onCancel} className="text-white">
          <X className="w-6 h-6" />
        </button>
        <span className="text-white font-semibold">Remix</span>
        <button
          onClick={handleExport}
          disabled={!newVideoUrl || isExporting}
          className={cn("text-sm font-semibold", newVideoUrl ? "text-white" : "text-white/40")}
        >
          {isExporting ? "..." : "Далее"}
        </button>
      </div>

      {/* Preview area */}
      {mode === "preview" ? (
        <div className="flex-1 relative">
          {splitMode === "side-by-side" ? (
            <div className="flex h-full">
              <video src={originalVideoUrl} autoPlay loop muted={originalMuted} playsInline
                className="flex-1 object-cover" />
              <div className="w-px bg-white/30" />
              {newVideoUrl && (
                <video src={newVideoUrl} autoPlay loop muted playsInline
                  className="flex-1 object-cover" />
              )}
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <video src={originalVideoUrl} autoPlay loop muted={originalMuted} playsInline
                className="flex-1 object-cover" />
              <div className="h-px bg-white/30" />
              {newVideoUrl && (
                <video src={newVideoUrl} autoPlay loop muted playsInline
                  className="flex-1 object-cover" />
              )}
            </div>
          )}
        </div>
      ) : mode === "select" ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
          {/* Превью оригинала */}
          <div className="w-40 h-72 rounded-2xl overflow-hidden">
            <video src={originalVideoUrl} autoPlay loop muted playsInline
              className="w-full h-full object-cover" />
          </div>
          <p className="text-white text-center text-sm">Добавьте своё видео для Remix</p>
          <div className="flex gap-4">
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 border-white/30 text-white bg-transparent"
            >
              <ImagePlus className="w-4 h-4 mr-2" />
              Галерея
            </Button>
            <Button
              onClick={startCameraRecording}
              className="flex-1 bg-white text-black"
            >
              <Camera className="w-4 h-4 mr-2" />
              Камера
            </Button>
          </div>
        </div>
      ) : (
        // Camera mode
        <div className="flex-1 relative">
          {cameraStream && (
            <video
              autoPlay
              playsInline
              muted
              ref={(el) => { if (el) el.srcObject = cameraStream; }}
              className="w-full h-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
          )}
          <div className="absolute bottom-8 left-0 right-0 flex justify-center">
            <Button onClick={stopCameraAndUse} className="bg-white text-black rounded-full px-8">
              <Check className="w-5 h-5 mr-2" />
              Использовать
            </Button>
          </div>
        </div>
      )}

      {/* Контролы */}
      {mode === "preview" && (
        <div className="flex items-center justify-between px-6 py-4">
          {/* Split mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setSplitMode("side-by-side")}
              className={cn(
                "p-2 rounded-lg",
                splitMode === "side-by-side" ? "bg-white/20" : "bg-transparent"
              )}
            >
              <Columns className="w-5 h-5 text-white" />
            </button>
            <button
              onClick={() => setSplitMode("top-bottom")}
              className={cn(
                "p-2 rounded-lg",
                splitMode === "top-bottom" ? "bg-white/20" : "bg-transparent"
              )}
            >
              <Rows className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Mute original */}
          <button
            onClick={() => setOriginalMuted(!originalMuted)}
            className="p-2 rounded-lg bg-white/10"
          >
            {originalMuted ? (
              <VolumeX className="w-5 h-5 text-white" />
            ) : (
              <Volume2 className="w-5 h-5 text-white" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
