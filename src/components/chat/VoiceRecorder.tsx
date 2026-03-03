import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, X, Send, Square } from 'lucide-react';

interface VoiceRecorderProps {
  isRecording: boolean;
  duration: number;
  waveform: number[];
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function VoiceRecorder({
  isRecording,
  duration,
  waveform,
  onStart,
  onStop,
  onCancel,
}: VoiceRecorderProps) {
  return (
    <AnimatePresence mode="wait">
      {isRecording ? (
        <motion.div
          key="recording"
          className="flex items-center gap-3 px-3 py-2 bg-zinc-900 rounded-2xl border border-red-500/30"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
        >
          {/* Кнопка отмены */}
          <button
            onClick={onCancel}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Индикатор записи */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <motion.div
              className="w-2.5 h-2.5 rounded-full bg-red-500"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
            <span className="text-red-400 text-sm font-mono font-medium tabular-nums">
              {formatDuration(duration)}
            </span>
          </div>

          {/* Визуализация waveform */}
          <div className="flex-1 flex items-center gap-0.5 h-8 overflow-hidden">
            {Array.from({ length: 40 }).map((_, i) => {
              const val = waveform[waveform.length - 40 + i] ?? 0;
              const height = Math.max(4, val * 28);
              return (
                <motion.div
                  key={i}
                  className="flex-1 rounded-full bg-red-400"
                  animate={{ height }}
                  transition={{ duration: 0.1 }}
                  style={{ minWidth: 2 }}
                />
              );
            })}
          </div>

          {/* Кнопка отправки */}
          <button
            onClick={onStop}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-blue-500 hover:bg-blue-400 text-white transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </motion.div>
      ) : (
        <motion.button
          key="mic-btn"
          onClick={onStart}
          className="w-10 h-10 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          whileTap={{ scale: 0.9 }}
        >
          <Mic className="w-5 h-5" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
