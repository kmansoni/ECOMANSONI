/**
 * @file src/components/reels/ReelMusicTrack.tsx
 * @description Отображение текущего трека с анимированной визуализацией (Instagram Stories/Reels стиль).
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Music, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReelMusicTrack as MusicTrack } from '@/types/reels/premium';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReelMusicTrackProps {
  /** Трек для отображения */
  track: MusicTrack | null;
  /** Воспроизводится ли сейчас */
  isPlaying: boolean;
  /** Громкость [0, 1] */
  volume: number;
  /** Обработчик переключения воспроизведения */
  onTogglePlay: () => void;
  /** Обработчик смены трека */
  onNextTrack: () => void;
  onPrevTrack: () => void;
  /** Обработчик изменения громкости */
  onVolumeChange: (volume: number) => void;
  /** Позиция воспроизведения [0, 1] */
  progress: number;
  /** Обработчик клика по треку (навигация) */
  onPress?: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Audio Visualizer (лёгкий, без AudioContext для совместимости)
// ---------------------------------------------------------------------------

function AudioVisualizer({ isPlaying }: { isPlaying: boolean }) {
  const bars = 5;
  const heights = useMemo(() => {
    if (!isPlaying) return Array(bars).fill(4);
    return Array.from({ length: bars }, () => 4 + Math.random() * 16);
  }, [isPlaying]);

  // Обновляем heights каждые 150ms при воспроизведении
  const [visualHeights, setVisualHeights] = useState(heights);

  useEffect(() => {
    if (!isPlaying) {
      setVisualHeights(Array(bars).fill(4));
      return;
    }
    const interval = setInterval(() => {
      setVisualHeights(Array.from({ length: bars }, () => 4 + Math.random() * 16));
    }, 150);
    return () => clearInterval(interval);
  }, [isPlaying, bars]);

  return (
    <div className="flex items-end gap-0.5 h-5">
      {visualHeights.map((h: number, i: number) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-gradient-to-t from-purple-400 to-pink-400"
          animate={{ height: h }}
          transition={{ duration: 0.1, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const ReelMusicTrack = memo<ReelMusicTrackProps>(({
  track,
  isPlaying,
  volume,
  onTogglePlay,
  onNextTrack,
  onPrevTrack,
  onVolumeChange,
  progress,
  onPress,
  className,
}) => {
  const [showVolume, setShowVolume] = useState(false);
  const volumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVolumeHover = useCallback(() => {
    if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
    setShowVolume(true);
  }, []);

  const handleVolumeLeave = useCallback(() => {
    volumeTimeoutRef.current = setTimeout(() => setShowVolume(false), 300);
  }, []);

  if (!track) return null;

  return (
    <motion.div
      className={cn(
        'flex items-center gap-2 px-2.5 py-1 rounded-full',
        'bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-violet-500/10',
        'border border-white/10 backdrop-blur-sm',
        'cursor-pointer active:scale-95 transition-transform',
        className,
      )}
      onClick={onPress}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      role="button"
      tabIndex={0}
      aria-label={`Музыка: ${track.title} — ${track.artist}`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPress?.(); } }}
    >
      {/* Иконка диска */}
      <div className="relative w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
        <div className={cn(
          'w-full h-full rounded-full border-2 border-white/40 flex items-center justify-center',
          'transition-transform duration-500',
          isPlaying ? 'animate-spin-slow' : '',
        )}
        style={{
          background: isPlaying
            ? 'conic-gradient(from 0deg, #a855f7, #ec4899, #a855f7)'
            : 'bg-white/10',
        }}
        >
          {!isPlaying && <Music size={10} className="text-white/80" />}
        </div>
        {/* Центральное отверстие диска */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-black" />
        </div>
      </div>

      {/* Информация о треке */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <p className="text-white text-xs font-medium truncate">
          {track.title}
        </p>
        <p className="text-white/60 text-[10px] truncate">
          {track.artist}
        </p>
      </div>

      {/* Визуализация */}
      <AudioVisualizer isPlaying={isPlaying} />

      {/* Кнопка воспроизведения */}
      <motion.button
        type="button"
        onClick={(e) => { e.stopPropagation(); onTogglePlay(); }}
        className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center flex-shrink-0"
        whileTap={{ scale: 0.8 }}
        aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
      >
        {isPlaying ? (
          <Pause size={10} className="text-white" />
        ) : (
          <Play size={10} className="text-white" fill="white" />
        )}
      </motion.button>

      {/* Регулятор громкости (по наведению) */}
      <div
        className="relative"
        onMouseEnter={handleVolumeHover}
        onMouseLeave={handleVolumeLeave}
      >
        <motion.button
          type="button"
          className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center flex-shrink-0"
          onClick={() => onVolumeChange(volume > 0 ? 0 : 1)}
          whileTap={{ scale: 0.8 }}
          aria-label="Громкость"
        >
          {volume === 0 ? (
            <VolumeX size={12} className="text-white/60" />
          ) : (
            <Volume2 size={12} className="text-white/60" />
          )}
        </motion.button>

        <AnimatePresence>
          {showVolume && (
            <motion.div
              className="absolute bottom-full right-0 mb-1 w-16 h-24 bg-zinc-900/95 backdrop-blur-md rounded-lg border border-white/10 p-1 flex flex-col items-center justify-center"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              onMouseEnter={handleVolumeHover}
              onMouseLeave={handleVolumeLeave}
            >
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                className="w-16 h-full -rotate-90 appearance-none cursor-pointer accent-purple-400 bg-white/10 rounded-full"
                aria-label="Громкость"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Прогресс-бар трека */}
      <div className="w-10 h-[2px] bg-white/10 rounded-full overflow-hidden flex-shrink-0">
        <motion.div
          className="h-full bg-gradient-to-r from-purple-400 to-pink-400 rounded-full"
          style={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>
    </motion.div>
  );
});

ReelMusicTrack.displayName = 'ReelMusicTrack';

export { ReelMusicTrack };
export type { ReelMusicTrackProps };