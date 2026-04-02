/**
 * MusicMessage — рендерит аудиофайлы (.mp3, .ogg, .flac, .wav, .aac, .m4a, .wma, .opus)
 * как красивый музыкальный плеер с play/pause, прогресс-баром и таймингом.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Music2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MusicMessageProps {
  fileUrl: string;
  fileName: string;
  isOwn: boolean;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MusicMessage({ fileUrl, fileName, isOwn }: MusicMessageProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const displayName = fileName.replace(/\.[^.]+$/, "");

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => setPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }, [playing]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
  }, [duration]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl px-4 py-3 backdrop-blur-xl border border-white/10 min-w-[240px] max-w-[320px]",
        isOwn ? "bg-white/10" : "bg-white/5",
      )}
    >
      <audio ref={audioRef} src={fileUrl} preload="metadata" />

      <button
        onClick={togglePlay}
        aria-label={playing ? "Пауза" : "Воспроизвести"}
        className="w-10 h-10 min-h-[44px] min-w-[44px] shrink-0 rounded-full bg-purple-500/20 flex items-center justify-center hover:bg-purple-500/30 transition-colors"
      >
        {playing ? (
          <Pause className="w-5 h-5 text-purple-400" />
        ) : (
          <Play className="w-5 h-5 text-purple-400 ml-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <Music2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <p className="text-sm font-medium text-white truncate">{displayName}</p>
        </div>

        <div
          className="h-1 rounded-full bg-white/10 cursor-pointer"
          onClick={handleSeek}
          role="slider"
          aria-label="Прогресс воспроизведения"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          tabIndex={0}
        >
          <div
            className="h-full rounded-full bg-purple-400 transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-white/40 tabular-nums">{formatTime(currentTime)}</span>
          <span className="text-[10px] text-white/40 tabular-nums">{duration > 0 ? formatTime(duration) : "--:--"}</span>
        </div>
      </div>
    </div>
  );
}
