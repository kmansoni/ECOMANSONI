/**
 * TimelineTrackHeader.tsx — Заголовок дорожки (слева от дорожки).
 * Имя, тип, mute, lock, visibility.
 */

import React, { useCallback, useState } from 'react';
import {
  Film,
  Music,
  Type,
  Sticker,
  Sparkles,
  Volume2,
  VolumeX,
  Lock,
  Unlock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useEditorStore } from '../../stores/editor-store';
import { useTimelineStore } from '../../stores/timeline-store';
import type { TrackType } from '../../types';

interface TimelineTrackHeaderProps {
  trackId: string;
  name: string;
  type: TrackType;
  isLocked: boolean;
  isVisible: boolean;
  volume: number;
  isSelected: boolean;
}

const TRACK_TYPE_ICONS: Record<TrackType, React.ElementType> = {
  video: Film,
  audio: Music,
  text: Type,
  sticker: Sticker,
  effect: Sparkles,
};

const TRACK_TYPE_COLORS: Record<TrackType, string> = {
  video: 'text-indigo-400',
  audio: 'text-green-400',
  text: 'text-yellow-400',
  sticker: 'text-pink-400',
  effect: 'text-violet-400',
};

export const TimelineTrackHeader = React.memo(function TimelineTrackHeader({
  trackId,
  name,
  type,
  isLocked,
  isVisible,
  volume,
  isSelected,
}: TimelineTrackHeaderProps) {
  const updateTrackLocal = useEditorStore((s) => s.updateTrackLocal);
  const selectTrack = useTimelineStore((s) => s.selectTrack);

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(name);

  const Icon = TRACK_TYPE_ICONS[type];
  const iconColor = TRACK_TYPE_COLORS[type];

  const handleDoubleClick = useCallback(() => {
    setNameDraft(name);
    setIsEditingName(true);
  }, [name]);

  const handleNameBlur = useCallback(() => {
    setIsEditingName(false);
    if (nameDraft.trim() && nameDraft !== name) {
      updateTrackLocal(trackId, { name: nameDraft.trim() });
    }
  }, [nameDraft, name, trackId, updateTrackLocal]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      if (e.key === 'Escape') setIsEditingName(false);
    },
    [],
  );

  const handleToggleMute = useCallback(() => {
    updateTrackLocal(trackId, { volume: volume === 0 ? 1 : 0 });
  }, [trackId, volume, updateTrackLocal]);

  const handleToggleLock = useCallback(() => {
    updateTrackLocal(trackId, { is_locked: !isLocked });
  }, [trackId, isLocked, updateTrackLocal]);

  const handleToggleVisibility = useCallback(() => {
    updateTrackLocal(trackId, { is_visible: !isVisible });
  }, [trackId, isVisible, updateTrackLocal]);

  const handleSelect = useCallback(() => {
    selectTrack(trackId);
  }, [trackId, selectTrack]);

  return (
    <div
      className={cn(
        'flex items-center gap-1 px-2 h-full border-b border-slate-800/50 cursor-pointer select-none',
        isSelected ? 'bg-[#1a1a3e]' : 'bg-[#111827] hover:bg-[#161b2e]',
      )}
      onClick={handleSelect}
      role="row"
      aria-label={`Дорожка: ${name}`}
    >
      <Icon className={cn('h-3.5 w-3.5 flex-shrink-0', iconColor)} />

      {isEditingName ? (
        <Input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={handleNameBlur}
          onKeyDown={handleNameKeyDown}
          className="h-5 text-xs bg-[#1f2937] border-slate-600 px-1 min-w-0 flex-1"
          autoFocus
          aria-label="Имя дорожки"
        />
      ) : (
        <span
          className="text-xs text-slate-300 truncate flex-1 min-w-0"
          onDoubleClick={handleDoubleClick}
          title={`Двойной клик для редактирования: ${name}`}
        >
          {name}
        </span>
      )}

      <div className="flex items-center gap-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-slate-500 hover:text-white"
              onClick={(e) => { e.stopPropagation(); handleToggleMute(); }}
              aria-label={volume === 0 ? 'Включить звук' : 'Выключить звук'}
            >
              {volume === 0 ? (
                <VolumeX className="h-3 w-3" />
              ) : (
                <Volume2 className="h-3 w-3" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{volume === 0 ? 'Включить звук' : 'Выключить звук'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-5 w-5 hover:text-white',
                isLocked ? 'text-amber-400' : 'text-slate-500',
              )}
              onClick={(e) => { e.stopPropagation(); handleToggleLock(); }}
              aria-label={isLocked ? 'Разблокировать' : 'Заблокировать'}
            >
              {isLocked ? (
                <Lock className="h-3 w-3" />
              ) : (
                <Unlock className="h-3 w-3" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{isLocked ? 'Разблокировать' : 'Заблокировать'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-5 w-5 hover:text-white',
                !isVisible ? 'text-slate-600' : 'text-slate-500',
              )}
              onClick={(e) => { e.stopPropagation(); handleToggleVisibility(); }}
              aria-label={isVisible ? 'Скрыть' : 'Показать'}
            >
              {isVisible ? (
                <Eye className="h-3 w-3" />
              ) : (
                <EyeOff className="h-3 w-3" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{isVisible ? 'Скрыть' : 'Показать'}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
});
