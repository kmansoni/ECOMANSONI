/**
 * MusicPanel.tsx — Левая панель: поиск и выбор музыки.
 */

import React, { useCallback, useState, useMemo } from 'react';
import { Search, Play, Pause, Plus, Music as MusicIcon, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { MusicTrack, MusicGenre, MusicMood } from '../../types';

interface MusicPanelProps {
  tracks: MusicTrack[];
  onAddToTimeline: (track: MusicTrack) => void;
  onPreviewPlay: (track: MusicTrack) => void;
  onPreviewStop: () => void;
  previewingTrackId: string | null;
}

const GENRE_OPTIONS: Array<{ value: MusicGenre | 'all'; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'pop', label: 'Поп' },
  { value: 'electronic', label: 'Электро' },
  { value: 'hip_hop', label: 'Хип-хоп' },
  { value: 'lofi', label: 'Lo-Fi' },
  { value: 'cinematic', label: 'Кино' },
  { value: 'ambient', label: 'Фон' },
];

const MOOD_OPTIONS: Array<{ value: MusicMood | 'all'; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'happy', label: '😊 Весело' },
  { value: 'energetic', label: '⚡ Энерг.' },
  { value: 'calm', label: '🧘 Спокой.' },
  { value: 'dramatic', label: '🎭 Драма' },
  { value: 'sad', label: '😢 Грустно' },
];

function formatMs(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  return `${min}:${String(sec % 60).padStart(2, '0')}`;
}

export const MusicPanel = React.memo(function MusicPanel({
  tracks: musicTracks,
  onAddToTimeline,
  onPreviewPlay,
  onPreviewStop,
  previewingTrackId,
}: MusicPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<MusicGenre | 'all'>('all');
  const [selectedMood, setSelectedMood] = useState<MusicMood | 'all'>('all');

  const filtered = useMemo(() => {
    let result = musicTracks;
    if (selectedGenre !== 'all') result = result.filter((t) => t.genre === selectedGenre);
    if (selectedMood !== 'all') result = result.filter((t) => t.mood === selectedMood);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.artist?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
  }, [musicTracks, selectedGenre, selectedMood, searchQuery]);

  const handleTogglePreview = useCallback(
    (track: MusicTrack) => {
      if (previewingTrackId === track.id) {
        onPreviewStop();
      } else {
        onPreviewPlay(track);
      }
    },
    [previewingTrackId, onPreviewPlay, onPreviewStop],
  );

  return (
    <div className="flex flex-col h-full" role="region" aria-label="Музыка">
      <div className="p-3 border-b border-slate-800 space-y-2">
        <h3 className="text-sm font-medium text-white">Музыка</h3>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск музыки..."
            className="h-7 pl-7 bg-[#1f2937] border-slate-700 text-xs"
            aria-label="Поиск музыки"
          />
        </div>

        <div className="flex flex-wrap gap-1">
          {GENRE_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant="ghost"
              size="sm"
              className={cn(
                'h-5 text-[10px] px-1.5',
                selectedGenre === opt.value
                  ? 'bg-green-600/20 text-green-300'
                  : 'text-slate-500 hover:text-white',
              )}
              onClick={() => setSelectedGenre(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1">
          {MOOD_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant="ghost"
              size="sm"
              className={cn(
                'h-5 text-[10px] px-1.5',
                selectedMood === opt.value
                  ? 'bg-green-600/20 text-green-300'
                  : 'text-slate-500 hover:text-white',
              )}
              onClick={() => setSelectedMood(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1 px-3">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-slate-600">
            <MusicIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-xs">Не найдено</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 py-3">
            {filtered.map((track) => (
              <div
                key={track.id}
                className="flex items-center gap-2 p-2 bg-[#1f2937] rounded-lg hover:bg-slate-700 group"
                role="listitem"
                aria-label={`${track.title} — ${track.artist ?? 'Unknown'}`}
              >
                <button
                  type="button"
                  className="h-8 w-8 rounded-full bg-green-600/20 flex items-center justify-center flex-shrink-0 hover:bg-green-600/40 transition-colors"
                  onClick={() => handleTogglePreview(track)}
                  aria-label={previewingTrackId === track.id ? 'Остановить' : 'Прослушать'}
                >
                  {previewingTrackId === track.id ? (
                    <Pause className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <Play className="h-3.5 w-3.5 text-green-400 ml-0.5" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white truncate">{track.title}</p>
                  <p className="text-[10px] text-slate-500 truncate">{track.artist ?? 'Unknown'}</p>
                </div>

                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                  <Clock className="h-3 w-3" />
                  {formatMs(track.duration_ms)}
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-slate-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => onAddToTimeline(track)}
                  aria-label={`Добавить "${track.title}" на таймлайн`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>

                {track.is_premium && (
                  <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1 rounded">PRO</span>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
});
