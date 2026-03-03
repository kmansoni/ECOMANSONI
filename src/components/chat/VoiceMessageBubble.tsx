import { motion } from 'framer-motion';
import { Play, Pause, CheckCheck } from 'lucide-react';

interface VoiceMessageBubbleProps {
  audioUrl: string;
  duration: number;
  waveform: number[];
  isOwnMessage: boolean;
  isListened?: boolean;
  isPlaying: boolean;
  playbackProgress: number;
  onPlay: () => void;
  onPause: () => void;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function VoiceMessageBubble({
  duration,
  waveform,
  isOwnMessage,
  isListened,
  isPlaying,
  playbackProgress,
  onPlay,
  onPause,
}: VoiceMessageBubbleProps) {
  const bars = waveform.length > 0 ? waveform : Array.from({ length: 30 }, () => Math.random() * 0.6 + 0.2);
  const remainingSeconds = isPlaying
    ? Math.round(duration * (1 - playbackProgress))
    : duration;

  const bgClass = isOwnMessage
    ? 'bg-blue-600'
    : 'bg-zinc-800';

  const barActiveClass = isOwnMessage ? 'bg-white' : 'bg-blue-400';
  const barInactiveClass = isOwnMessage ? 'bg-white/40' : 'bg-zinc-500';

  return (
    <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-2xl min-w-[180px] max-w-[260px] ${bgClass}`}>
      {/* Кнопка Play/Pause */}
      <button
        onClick={isPlaying ? onPause : onPlay}
        className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 text-white" />
        ) : (
          <Play className="w-4 h-4 text-white ml-0.5" />
        )}
      </button>

      <div className="flex-1 flex flex-col gap-1">
        {/* Waveform визуализация */}
        <div className="flex items-center gap-0.5 h-7">
          {bars.map((val, i) => {
            const progress = playbackProgress * bars.length;
            const isPast = i < progress;
            const height = Math.max(4, val * 24);
            return (
              <motion.div
                key={i}
                className={`flex-1 rounded-full transition-colors duration-100 ${isPast ? barActiveClass : barInactiveClass}`}
                style={{ height }}
              />
            );
          })}
        </div>

        {/* Длительность и статус */}
        <div className="flex items-center justify-between">
          <span className="text-white/70 text-xs font-mono tabular-nums">
            {formatDuration(remainingSeconds)}
          </span>
          {isOwnMessage && (
            <CheckCheck
              className={`w-3.5 h-3.5 ${isListened ? 'text-white' : 'text-white/50'}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
