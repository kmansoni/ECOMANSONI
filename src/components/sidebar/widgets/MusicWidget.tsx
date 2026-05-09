import React, { useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, Volume2, Music2 } from 'lucide-react';

export default function MusicWidget() {
  const [playing, setPlaying] = useState(false);

  const currentTrack = {
    title: 'Город, которого нет',
    artist: 'Муджик',
    duration: '3:45',
    progress: 0.45,
  };

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2 mb-2">
        <Music2 className="h-4 w-4 text-cyan-400" />
        <span className="text-xs font-semibold text-white">Сейчас играет</span>
      </div>
      <div className="text-sm font-medium text-white truncate">{currentTrack.title}</div>
      <div className="text-[11px] text-gray-400">{currentTrack.artist}</div>
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => {}}
          className="text-white/50 hover:text-white transition-colors"
        >
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          onClick={() => setPlaying(!playing)}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
        </button>
        <button
          onClick={() => {}}
          className="text-white/50 hover:text-white transition-colors"
        >
          <SkipForward className="h-4 w-4" />
        </button>
        <div className="ml-auto flex items-center gap-1">
          <Volume2 className="h-3 w-3 text-white/40" />
          <div className="h-1 w-12 rounded-full bg-white/20">
            <div className="h-full w-2/3 rounded-full bg-cyan-400" />
          </div>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-1 text-[10px] text-gray-500">
        <span>{(currentTrack.duration * currentTrack.progress / 100 * 100).toFixed(0)}:00</span>
        <div className="flex-1 h-0.5 rounded-full bg-white/10 mx-1">
          <div className="h-full rounded-full bg-cyan-400" style={{ width: `${currentTrack.progress * 100}%` }} />
        </div>
        <span>{currentTrack.duration}</span>
      </div>
    </div>
  );
}