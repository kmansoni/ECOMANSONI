/**
 * @file src/components/chat/VideoMessageBubble.tsx
 * @description Видеосообщения (кружки) в чате — аналог Instagram/Telegram.
 *
 * Архитектура:
 * - Круглый видеоплеер (aspect-ratio: 1/1, border-radius: 50%)
 * - Запись: MediaRecorder + getUserMedia (video: true, audio: true)
 * - Максимум 60 секунд
 * - Прогресс-кольцо через SVG stroke-dashoffset
 * - Автовоспроизведение при появлении в viewport (IntersectionObserver)
 * - Статус просмотра: viewed_by array в БД
 * - Размер: 200x200px (фиксированный)
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Eye, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";

const BUBBLE_SIZE = 200;
const MAX_DURATION_MS = 60_000;
const STROKE_WIDTH = 4;
const RADIUS = (BUBBLE_SIZE / 2) - STROKE_WIDTH;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface VideoMessageBubbleProps {
  videoUrl: string;
  thumbnailUrl?: string;
  durationMs: number;
  senderId: string;
  messageId: string;
  viewedBy: string[];
  isOwn: boolean;
  onViewed?: () => void;
}

export function VideoMessageBubble({
  videoUrl,
  thumbnailUrl,
  durationMs,
  senderId,
  messageId,
  viewedBy,
  isOwn,
  onViewed,
}: VideoMessageBubbleProps) {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasViewed, setHasViewed] = useState(
    user ? viewedBy.includes(user.id) : false
  );
  const rafRef = useRef<number>(0);

  // Прогресс-кольцо
  const strokeDashoffset = CIRCUMFERENCE - (progress / 100) * CIRCUMFERENCE;

  // Обновление прогресса
  const updateProgress = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.duration === 0) return;
    const pct = (video.currentTime / video.duration) * 100;
    setProgress(pct);
    if (!video.paused) {
      rafRef.current = requestAnimationFrame(updateProgress);
    }
  }, []);

  // Автовоспроизведение при появлении в viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && videoRef.current) {
          videoRef.current.play().catch((error) => {
            logger.debug("video-message-bubble: autoplay blocked", { messageId, error });
          });
        } else if (videoRef.current) {
          videoRef.current.pause();
        }
      },
      { threshold: 0.7 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handlePlay = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      setIsLoading(true);
      try {
        await video.play();
      } catch (error) {
        logger.warn("video-message-bubble: play failed", { messageId, error });
        setIsLoading(false);
      }
    } else {
      video.pause();
    }
  }, [messageId]);

  // Отметить как просмотренное
  const markViewed = useCallback(async () => {
    if (!user || hasViewed || isOwn) return;
    setHasViewed(true);
    onViewed?.();
    const db = supabase as any;
    await db
      .from("video_messages")
      .update({ viewed_by: [...viewedBy, user.id] })
      .eq("id", messageId);
  }, [user, hasViewed, isOwn, viewedBy, messageId, onViewed]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => {
      setIsPlaying(true);
      setIsLoading(false);
      rafRef.current = requestAnimationFrame(updateProgress);
      markViewed();
    };
    const onPause = () => {
      setIsPlaying(false);
      cancelAnimationFrame(rafRef.current);
    };
    const onEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      cancelAnimationFrame(rafRef.current);
    };
    const onWaiting = () => setIsLoading(true);
    const onCanPlay = () => setIsLoading(false);

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("canplay", onCanPlay);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("canplay", onCanPlay);
      cancelAnimationFrame(rafRef.current);
    };
  }, [updateProgress, markViewed]);

  const viewCount = viewedBy.length;

  return (
    <div
      className={cn("flex flex-col gap-1", isOwn ? "items-end" : "items-start")}
    >
      <div
        ref={containerRef}
        className="relative cursor-pointer"
        style={{ width: BUBBLE_SIZE, height: BUBBLE_SIZE }}
        onClick={handlePlay}
      >
        {/* Видео */}
        <video
          ref={videoRef}
          src={videoUrl}
          poster={thumbnailUrl}
          playsInline
          muted={false}
          loop={false}
          preload="metadata"
          className="absolute inset-0 w-full h-full object-cover rounded-full"
          style={{ borderRadius: "50%" }}
        />

        {/* Прогресс-кольцо SVG */}
        <svg
          className="absolute inset-0 -rotate-90"
          width={BUBBLE_SIZE}
          height={BUBBLE_SIZE}
        >
          {/* Фоновое кольцо */}
          <circle
            cx={BUBBLE_SIZE / 2}
            cy={BUBBLE_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.3)"
            strokeWidth={STROKE_WIDTH}
          />
          {/* Прогресс */}
          <circle
            cx={BUBBLE_SIZE / 2}
            cy={BUBBLE_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="white"
            strokeWidth={STROKE_WIDTH}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.1s linear" }}
          />
        </svg>

        {/* Overlay: play/pause/loading */}
        <AnimatePresence>
          {(!isPlaying || isLoading) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/20"
            >
              {isLoading ? (
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              ) : (
                <Play className="w-8 h-8 text-white fill-white" />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Непросмотренный индикатор */}
        {!hasViewed && !isOwn && (
          <div className="absolute bottom-1 right-1 w-3 h-3 bg-primary rounded-full border-2 border-background" />
        )}
      </div>

      {/* Метаданные */}
      <div className="flex items-center gap-1 px-1">
        <span className="text-xs text-muted-foreground">
          {Math.round(durationMs / 1000)}с
        </span>
        {isOwn && viewCount > 0 && (
          <div className="flex items-center gap-0.5">
            <Eye className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{viewCount}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Компонент записи видеосообщения
// ─────────────────────────────────────────────────────────────

interface VideoMessageRecorderProps {
  onRecorded: (blob: Blob, durationMs: number) => void;
  onCancel: () => void;
}

export function VideoMessageRecorder({ onRecorded, onCancel }: VideoMessageRecorderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const progress = Math.min((elapsed / (MAX_DURATION_MS / 1000)) * 100, 100);
  const strokeDashoffset = CIRCUMFERENCE - (progress / 100) * CIRCUMFERENCE;

  useEffect(() => {
    // Запрашиваем доступ к камере при монтировании
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: true })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setHasPermission(true);
      })
      .catch(() => setHasPermission(false));

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";

    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_500_000 });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const durationMs = Date.now() - startTimeRef.current;
      const blob = new Blob(chunksRef.current, { type: mimeType });
      onRecorded(blob, durationMs);
    };

    recorder.start(100); // chunk каждые 100ms
    startTimeRef.current = Date.now();
    setIsRecording(true);
    setElapsed(0);

    timerRef.current = setInterval(() => {
      const sec = (Date.now() - startTimeRef.current) / 1000;
      setElapsed(sec);
      if (sec >= MAX_DURATION_MS / 1000) {
        stopRecording();
      }
    }, 100);
  }, [onRecorded]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }, []);

  if (hasPermission === false) {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <p className="text-sm text-muted-foreground text-center">
          Нет доступа к камере. Разрешите доступ в настройках браузера.
        </p>
        <button onClick={onCancel} className="text-sm text-primary">Отмена</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      {/* Превью камеры */}
      <div className="relative" style={{ width: BUBBLE_SIZE, height: BUBBLE_SIZE }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover rounded-full"
          style={{ borderRadius: "50%", transform: "scaleX(-1)" }}
        />

        {/* Прогресс-кольцо */}
        {isRecording && (
          <svg className="absolute inset-0 -rotate-90" width={BUBBLE_SIZE} height={BUBBLE_SIZE}>
            <circle cx={BUBBLE_SIZE/2} cy={BUBBLE_SIZE/2} r={RADIUS} fill="none"
              stroke="rgba(255,255,255,0.3)" strokeWidth={STROKE_WIDTH} />
            <circle cx={BUBBLE_SIZE/2} cy={BUBBLE_SIZE/2} r={RADIUS} fill="none"
              stroke="#ef4444" strokeWidth={STROKE_WIDTH}
              strokeDasharray={CIRCUMFERENCE} strokeDashoffset={strokeDashoffset}
              strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.1s linear" }} />
          </svg>
        )}

        {/* Таймер */}
        {isRecording && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 rounded-full px-2 py-0.5">
            <span className="text-white text-xs font-mono">
              {Math.floor(elapsed)}s / {MAX_DURATION_MS / 1000}s
            </span>
          </div>
        )}
      </div>

      {/* Кнопки */}
      <div className="flex gap-4">
        <button onClick={onCancel} className="px-4 py-2 rounded-full border border-border text-sm">
          Отмена
        </button>
        {!isRecording ? (
          <button
            onClick={startRecording}
            disabled={hasPermission === null}
            className="px-6 py-2 rounded-full bg-destructive text-white text-sm font-medium"
          >
            ● Запись
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="px-6 py-2 rounded-full bg-muted text-sm font-medium"
          >
            ■ Стоп
          </button>
        )}
      </div>
    </div>
  );
}
