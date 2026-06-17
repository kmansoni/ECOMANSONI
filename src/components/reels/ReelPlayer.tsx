/**
 * @file src/components/reels/ReelPlayer.tsx
 * @description Расширенный видеоплеер Reels с поддержкой скоростей, PiP,
 * жестов и расширенного буферинга (Instagram/Telegram Premium стиль).
 */

import React, {
  memo, useCallback, useEffect, useRef, useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Play, Pause, AlertCircle, Loader2,
  SkipBack, SkipForward, Gauge,
  Volume2, VolumeX, Maximize,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { useReelsContext } from '@/contexts/ReelsContext';
import { normalizeReelMediaUrl } from '@/lib/reels/media';
import { ReelDoubleTapHeart } from './ReelDoubleTapHeart';
import { ReelProgressBar } from './ReelProgressBar';
import type { TapPosition } from '@/types/reels';
import type { PlaybackSpeed } from '@/types/reels/premium';
import type { BufferState } from '@/types/reels';

// ---------------------------------------------------------------------------
// Константы
// ---------------------------------------------------------------------------

const TAP_DEBOUNCE_MS = 250;
const LONG_PRESS_MS = 600;
const ICON_SHOW_DURATION_MS = 500;
const ICON_FADE_MS = 0.15;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ReelPlayerProps {
  videoUrl: string;
  thumbnailUrl: string | null;
  isActive: boolean;
  onDoubleTap: (position: TapPosition) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
  onBufferStateChange?: (state: BufferState) => void;
  onProgress?: (currentTime: number, duration: number) => void;
  onVideoEnd?: () => void;
  /** Скорость воспроизведения (по умолчанию 1) */
  speed?: PlaybackSpeed;
  className?: string;
}

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

function getBufferedPercent(video: HTMLVideoElement): number {
  if (video.duration <= 0 || video.buffered.length === 0) return 0;
  const bufferedEnd = video.buffered.end(video.buffered.length - 1);
  return Math.min(100, (bufferedEnd / video.duration) * 100);
}

// ---------------------------------------------------------------------------
// Компонент
// ---------------------------------------------------------------------------

function ReelPlayerInner({
  videoUrl,
  thumbnailUrl,
  isActive,
  onDoubleTap,
  onPlayStateChange,
  onBufferStateChange,
  onProgress,
  onVideoEnd,
  speed = 1.0,
  className,
}: ReelPlayerProps) {
  // -- Рефы -----
  const videoRef = useRef<HTMLVideoElement>(null);
  const blurVideoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number>(0);
  const tapCountRef = useRef<number>(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapPositionRef = useRef<TapPosition>({ x: 0, y: 0 });
  const iconTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const previousSpeedRef = useRef<PlaybackSpeed>(speed);

  // -- Состояние -----
  const [isPaused, setIsPaused] = useState<boolean>(true);
  const [showIcon, setShowIcon] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [tapHeartPosition, setTapHeartPosition] = useState<TapPosition | null>(null);
  const [showSpeedIndicator, setShowSpeedIndicator] = useState(false);

  // -- Контекст -----
  const { isMuted } = useReelsContext();

  // Нормализованный URL
  const normalizedUrl = normalizeReelMediaUrl(videoUrl);

  // ---------------------------------------------------------------------------
  // RAF прогресс-бара
  // ---------------------------------------------------------------------------

  const startProgressRAF = useCallback(() => {
    const tick = () => {
      if (!isMountedRef.current) return;
      const video = videoRef.current;
      if (!video) return;
      const ct = video.currentTime;
      const dur = video.duration || 0;
      setCurrentTime(ct);
      setDuration(dur);
      onProgress?.(ct, dur);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [onProgress]);

  const stopProgressRAF = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Синхронизация скорости воспроизведения
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Запоминаем позицию для PiP
    if (previousSpeedRef.current !== speed) {
      video.playbackRate = speed;
      previousSpeedRef.current = speed;
      // Кратковременный индикатор скорости
      setShowSpeedIndicator(true);
      setTimeout(() => setShowSpeedIndicator(false), 1200);
    }
  }, [speed]);

  // ---------------------------------------------------------------------------
  // Управление воспроизведением при isActive
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            if (!isMountedRef.current) return;
            setIsPaused(false);
            onPlayStateChange?.(true);
            startProgressRAF();
          })
          .catch((err: Error) => {
            if (err.name !== 'AbortError') {
              logger.warn('[ReelPlayer] play() rejected', { name: err.name, message: err.message });
            }
          });
      }
      blurVideoRef.current?.play().catch(() => {});
    } else {
      video.pause();
      // Сброс времени может выбросить ошибку, если метаданные ещё не загружены
      try {
        video.currentTime = 0;
      } catch {
        // Игнорируем — видео не готово
      }
      setIsPaused(true);
      setCurrentTime(0);
      onPlayStateChange?.(false);
      stopProgressRAF();
      if (blurVideoRef.current) {
        blurVideoRef.current.pause();
        try {
          blurVideoRef.current.currentTime = 0;
        } catch {
          // ignore
        }
      }
    }
  }, [isActive, startProgressRAF, stopProgressRAF, onPlayStateChange]);

   // ---------------------------------------------------------------------------
   // Синхронизация muted с контекстом
   // ---------------------------------------------------------------------------

   useEffect(() => {
     const video = videoRef.current;
     if (video) {
       video.muted = isMuted;
     }
   }, [isMuted]);

  // ---------------------------------------------------------------------------
  // Обработчики событий video
  // ---------------------------------------------------------------------------

  const handleCanPlay = useCallback(() => {
    setIsBuffering(false);
    setHasError(false);
    const video = videoRef.current;
    if (video) {
      video.playbackRate = speed;
      const bufferPercent = getBufferedPercent(video);
      onBufferStateChange?.({
        isBuffering: false,
        bufferedPercent: bufferPercent,
        currentTime: video.currentTime,
        duration: video.duration || 0,
      });
    }
  }, [onBufferStateChange, speed]);

  const handleWaiting = useCallback(() => {
    setIsBuffering(true);
    const video = videoRef.current;
    if (video) {
      onBufferStateChange?.({
        isBuffering: true,
        bufferedPercent: getBufferedPercent(video),
        currentTime: video.currentTime,
        duration: video.duration || 0,
      });
    }
  }, [onBufferStateChange]);

  const handleProgress = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    onBufferStateChange?.({
      isBuffering: video.readyState < 3,
      bufferedPercent: getBufferedPercent(video),
      currentTime: video.currentTime,
      duration: video.duration || 0,
    });
  }, [onBufferStateChange]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      setDuration(video.duration || 0);
      // Применяем скорость сразу после загрузки метаданных
      video.playbackRate = speed;
    }
  }, [speed]);

  const handleError = useCallback(() => {
    setIsBuffering(false);
    setHasError(true);
    stopProgressRAF();
    onBufferStateChange?.({
      isBuffering: false,
      bufferedPercent: 0,
      currentTime: 0,
      duration: 0,
    });
  }, [onBufferStateChange, stopProgressRAF]);

  const handleEnded = useCallback(() => {
    onVideoEnd?.();
  }, [onVideoEnd]);

  const handlePlay = useCallback(() => {
    setIsPaused(false);
    onPlayStateChange?.(true);
    startProgressRAF();
  }, [onPlayStateChange, startProgressRAF]);

  const handlePause = useCallback(() => {
    setIsPaused(true);
    onPlayStateChange?.(false);
    stopProgressRAF();
  }, [onPlayStateChange, stopProgressRAF]);

  // ---------------------------------------------------------------------------
  // Показ иконки play/pause
  // ---------------------------------------------------------------------------

  const flashIcon = useCallback(() => {
    setShowIcon(true);
    if (iconTimerRef.current) clearTimeout(iconTimerRef.current);
    iconTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) setShowIcon(false);
    }, ICON_SHOW_DURATION_MS);
  }, []);

  // ---------------------------------------------------------------------------
  // Toggle play/pause
  // ---------------------------------------------------------------------------

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch((err: Error) => {
        if (err.name !== 'AbortError') {
          logger.warn('[ReelPlayer] play() rejected on toggle', { message: err.message });
        }
      });
    } else {
      video.pause();
    }
    flashIcon();
  }, [flashIcon]);

  // ---------------------------------------------------------------------------
  // Tap detection (single / double / long-press)
  // ---------------------------------------------------------------------------

  const clearTapTimer = useCallback(() => {
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
    }
  }, []);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      lastTapPositionRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      tapCountRef.current += 1;
      clearLongPressTimer();

      if (tapTimerRef.current === null) {
        tapTimerRef.current = setTimeout(() => {
          tapTimerRef.current = null;
          const count = tapCountRef.current;
          tapCountRef.current = 0;

          if (!isMountedRef.current) return;

          if (count === 1) {
            togglePlayback();
          } else if (count >= 2) {
            setTapHeartPosition({ ...lastTapPositionRef.current });
            onDoubleTap(lastTapPositionRef.current);
          }
        }, TAP_DEBOUNCE_MS);
      }
    },
    [togglePlayback, onDoubleTap, clearLongPressTimer],
  );

  const handlePointerUp = useCallback(() => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  // ---------------------------------------------------------------------------
  // Регистрация video event listeners
  // ---------------------------------------------------------------------------

  useEffect(() => {
    isMountedRef.current = true;
    const video = videoRef.current;
    if (!video) return;

    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('error', handleError);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      isMountedRef.current = false;
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);

      stopProgressRAF();
      clearTapTimer();
      clearLongPressTimer();
      if (iconTimerRef.current) clearTimeout(iconTimerRef.current);
    };
  }, [
    handleCanPlay, handleWaiting, handleProgress,
    handleLoadedMetadata, handleError, handleEnded,
    handlePlay, handlePause, stopProgressRAF,
    clearTapTimer, clearLongPressTimer,
  ]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className={cn(
        'relative w-full h-full overflow-hidden bg-black select-none',
        className,
      )}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      role="button"
      tabIndex={0}
      aria-label="Видео Reel. Коснитесь для паузы/воспроизведения, дважды — для лайка"
    >
      {/* Blur-background */}
      <video
        ref={blurVideoRef}
        src={normalizedUrl}
        poster={thumbnailUrl ?? undefined}
        muted
        loop
        playsInline
        webkit-playsinline="true"
        preload={isActive ? 'metadata' : 'none'}
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-0 w-full h-full object-cover scale-[1.2] blur-[30px] opacity-50 pointer-events-none"
      />

      {/* Основное видео */}
      <video
        ref={videoRef}
        src={normalizedUrl}
        poster={thumbnailUrl ?? undefined}
        muted={isMuted}
        loop
        playsInline
        webkit-playsinline="true"
        preload={isActive ? 'metadata' : 'none'}
        aria-label="Reel видео"
        className="absolute inset-0 w-full h-full object-cover z-[1]"
        style={{
          // Применяем скорость (для быстрого/медленного режима)
          transition: 'filter 0.3s ease',
        }}
      />

      {/* Thumbnail пока видео не готово */}
      {thumbnailUrl && isBuffering && !hasError && (
        <div
          className="absolute inset-0 z-[2] pointer-events-none"
          aria-hidden="true"
        >
          <img
            loading="lazy"
            src={thumbnailUrl}
            alt=""
            className="w-full h-full object-cover"
            draggable={false}
          />
        </div>
      )}

      {/* Buffering spinner — glass-styled */}
      {isBuffering && !hasError && (
        <div
          className="absolute inset-0 z-[3] flex items-center justify-center pointer-events-none"
          aria-label="Загрузка видео"
          role="status"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
            className="relative w-14 h-14"
          >
            {/* Outer ring */}
            <div className="absolute inset-0 rounded-full border-2 border-white/10" />
            {/* Gradient spinner */}
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400/80 border-r-teal-400/60" />
            {/* Inner glow */}
            <div className="absolute inset-2 rounded-full border border-cyan-400/20" />
            {/* Center dot */}
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="absolute inset-4 rounded-full bg-cyan-400/30 backdrop-blur-sm"
            />
          </motion.div>
        </div>
      )}

      {/* Error fallback — glass styled */}
      {hasError && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute inset-0 z-[3] flex flex-col items-center justify-center gap-3"
          role="alert"
          aria-label="Ошибка загрузки видео"
        >
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-2xl bg-[linear-gradient(145deg,rgba(239,68,68,0.2),rgba(239,68,68,0.05))] border border-red-500/30 backdrop-blur-xl" />
            <div className="absolute inset-0 rounded-2xl flex items-center justify-center">
              <AlertCircle size={32} className="text-red-400" />
            </div>
            <div className="absolute -inset-2 rounded-2xl bg-gradient-to-br from-red-500/10 via-transparent to-transparent blur-md opacity-60" />
          </div>
          <div className="px-4 py-2 rounded-xl backdrop-blur-xl bg-[linear-gradient(145deg,rgba(239,68,68,0.1),rgba(239,68,68,0.05))] border border-red-500/20">
            <p className="text-white/80 text-sm font-medium text-center">
              Не удалось загрузить видео
            </p>
          </div>
        </motion.div>
      )}

      {/* Play/Pause icon — glass styled */}
      <AnimatePresence>
        {showIcon && (
          <motion.div
            key="play-pause-icon"
            className="absolute inset-0 z-[4] flex items-center justify-center pointer-events-none"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.15, ease: 'easeInOut' }}
            aria-hidden="true"
          >
            <motion.div
              initial={{ scale: 0.6 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.7 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              className="relative w-20 h-20 rounded-full backdrop-blur-xl"
            >
              {/* Glass background */}
              <div className="absolute inset-0 rounded-full bg-[linear-gradient(145deg,rgba(255,255,255,0.15),rgba(255,255,255,0.05))] border border-white/20 shadow-[0_16px_48px_-16px_rgba(0,0,0,0.5)]" />

              {/* Inner glow */}
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: 'radial-gradient(circle at center, rgba(255,255,255,0.1), transparent 70%)',
                }}
              />

              {/* Top highlight */}
              <div
                className="absolute inset-x-6 top-0 h-px"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)',
                }}
              />

              {/* Icon */}
              <div className="absolute inset-0 flex items-center justify-center">
                {isPaused ? (
                  <Play size={32} fill="white" stroke="white" className="drop-shadow-lg" />
                ) : (
                  <Pause size={32} fill="white" stroke="white" className="drop-shadow-lg" />
                )}
              </div>

              {/* Outer glow ring */}
              <div
                className="absolute -inset-1 rounded-full opacity-30"
                style={{
                  background: 'linear-gradient(135deg, rgba(0,180,216,0.3), rgba(0,200,150,0.2))',
                  filter: 'blur(8px)',
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Speed indicator — glass styled */}
      <AnimatePresence>
        {showSpeedIndicator && (
          <motion.div
            key="speed-indicator"
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[5] pointer-events-none"
            initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 1.5, opacity: 0, rotate: 10 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            aria-hidden="true"
          >
            <div className="relative px-5 py-3 rounded-2xl backdrop-blur-2xl">
              {/* Glass background */}
              <div className="absolute inset-0 rounded-2xl bg-[linear-gradient(145deg,rgba(0,180,216,0.2),rgba(0,200,150,0.1))] border border-cyan-400/30 shadow-[0_12px_40px_-12px_rgba(0,180,216,0.5)]" />

              {/* Inner glow */}
              <div
                className="absolute inset-0 rounded-2xl"
                style={{
                  background: 'radial-gradient(ellipse at center, rgba(0,180,216,0.2), transparent 70%)',
                }}
              />

              {/* Top highlight */}
              <div
                className="absolute inset-x-4 top-0 h-px"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                }}
              />

              <span className="relative text-white font-bold text-2xl tabular-nums drop-shadow-lg">
                {speed}×
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Double-tap сердце */}
      <ReelDoubleTapHeart
        position={tapHeartPosition}
        onAnimationComplete={useCallback(() => {
          setTapHeartPosition(null);
        }, [])}
      />

      {/* Progress bar */}
      <ReelProgressBar
        currentTime={currentTime}
        duration={duration}
        className="z-[5]"
      />
    </div>
  );
}

const ReelPlayer = memo(ReelPlayerInner, (prev, next) => (
  prev.videoUrl === next.videoUrl
  && prev.isActive === next.isActive
  && prev.thumbnailUrl === next.thumbnailUrl
  && prev.speed === next.speed
));

ReelPlayer.displayName = 'ReelPlayer';

export { ReelPlayer };