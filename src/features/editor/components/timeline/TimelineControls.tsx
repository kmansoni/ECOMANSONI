/**
 * TimelineControls.tsx — Play/Pause/Stop + скорость + timestamp.
 */

import React, { useCallback } from 'react';
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTimelineStore } from '../../stores/timeline-store';
import { useEditorStore } from '../../stores/editor-store';
import { PLAYBACK_RATES } from '../../constants';
import { TimeDisplay } from '../shared/TimeDisplay';

export const TimelineControls = React.memo(function TimelineControls() {
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const currentTimeMs = useTimelineStore((s) => s.currentTimeMs);
  const playbackRate = useTimelineStore((s) => s.playbackRate);
  const togglePlayback = useTimelineStore((s) => s.togglePlayback);
  const seek = useTimelineStore((s) => s.seek);
  const setPlaybackRate = useTimelineStore((s) => s.setPlaybackRate);
  const getProjectDuration = useEditorStore((s) => s.getProjectDuration);

  const projectDuration = getProjectDuration();

  const handleStop = useCallback(() => {
    useTimelineStore.getState().pause();
    seek(0);
  }, [seek]);

  const handleSkipBack = useCallback(() => {
    seek(0);
  }, [seek]);

  const handleSkipForward = useCallback(() => {
    seek(projectDuration);
  }, [seek, projectDuration]);

  const handleRateChange = useCallback(
    (value: string) => {
      setPlaybackRate(parseFloat(value));
    },
    [setPlaybackRate],
  );

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 bg-[#111827] border-t border-slate-800"
      role="toolbar"
      aria-label="Управление воспроизведением"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-white"
            onClick={handleSkipBack}
            aria-label="В начало"
          >
            <SkipBack className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>В начало</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:bg-indigo-600 rounded-full"
            onClick={togglePlayback}
            aria-label={isPlaying ? 'Пауза' : 'Воспроизведение'}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 ml-0.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isPlaying ? 'Пауза' : 'Воспроизведение'} (Пробел)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-white"
            onClick={handleStop}
            aria-label="Стоп"
          >
            <Square className="h-3 w-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Стоп</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-white"
            onClick={handleSkipForward}
            aria-label="В конец"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>В конец</TooltipContent>
      </Tooltip>

      <div className="flex items-center gap-1 ml-2">
        <TimeDisplay timeMs={currentTimeMs} className="text-xs" />
        <span className="text-xs text-slate-600">/</span>
        <TimeDisplay timeMs={projectDuration} className="text-xs text-slate-500" />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-slate-500">Скорость:</span>
        <Select value={String(playbackRate)} onValueChange={handleRateChange}>
          <SelectTrigger
            className="h-6 w-16 bg-[#1f2937] border-slate-700 text-xs"
            aria-label="Скорость воспроизведения"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1f2937] border-slate-700">
            {PLAYBACK_RATES.map((rate) => (
              <SelectItem key={rate} value={String(rate)} className="text-xs">
                {rate}x
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
});
