import { useState, useCallback, useRef } from 'react';
import { Music2, Sparkles, Wand2, User, Timer, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { editorApi } from '@/features/editor/api';

const REEL_EFFECT_PRESETS = [
  { id: 'none', label: 'Без эффекта' },
  { id: 'cinematic', label: 'Кино' },
  { id: 'vintage', label: 'Винтаж' },
  { id: 'vivid', label: 'Яркий' },
] as const;

interface QuickPanelsProps {
  active: 'audio' | 'effects' | null;
  onClose: () => void;
  audioQuery: string;
  onAudioQueryChange: (query: string) => void;
  audioTracks: Array<{ id: string; title: string; artist?: string | null }>;
  isAudioLoading: boolean;
  selectedMusicTrackId: string | null;
  onSelectTrack: (track: { id: string; title: string; artist?: string | null }) => void;
  reelEffectPreset: string;
  onEffectPresetChange: (preset: string) => void;
  onLoadAudioTracks: (query?: string) => Promise<void>;
}

export function QuickPanels({
  active,
  onClose,
  audioQuery,
  onAudioQueryChange,
  audioTracks,
  isAudioLoading,
  selectedMusicTrackId,
  onSelectTrack,
  reelEffectPreset,
  onEffectPresetChange,
  onLoadAudioTracks,
}: QuickPanelsProps) {
  if (active === 'audio') {
    return (
      <div className="absolute left-14 top-1/2 -translate-y-1/2 z-20 w-72 rounded-2xl border border-white/20 bg-black/60 backdrop-blur-md p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-white/90">Выбор аудио</span>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xs">Закрыть</button>
        </div>
        <Input
          value={audioQuery}
          onChange={(e) => onAudioQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void onLoadAudioTracks(audioQuery);
            }
          }}
          placeholder="Поиск по трекам"
          className="h-8 bg-white/10 border-white/20 text-white placeholder:text-white/50"
        />
        <div className="max-h-48 overflow-y-auto space-y-1">
          {isAudioLoading ? (
            <div className="flex items-center gap-2 text-white/70 text-xs py-3 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              Загрузка...
            </div>
          ) : audioTracks.length === 0 ? (
            <p className="text-xs text-white/60 py-2 text-center">Нет результатов</p>
          ) : (
            audioTracks.map((track) => (
              <button
                key={track.id}
                onClick={() => {
                  onSelectTrack(track);
                  onClose();
                  toast.success('Аудио добавлено');
                }}
                className={cn(
                  'w-full text-left rounded-lg px-2 py-1.5 text-xs border transition-colors',
                  selectedMusicTrackId === track.id
                    ? 'bg-blue-600/50 border-blue-300/50 text-white'
                    : 'bg-white/5 border-white/10 text-white/90 hover:bg-white/10',
                )}
              >
                <div className="font-medium truncate">{track.title}</div>
                <div className="text-white/60 truncate">{track.artist || 'Неизвестный артист'}</div>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  if (active === 'effects') {
    return (
      <div className="absolute left-14 top-1/2 -translate-y-1/2 z-20 w-56 rounded-2xl border border-white/20 bg-black/60 backdrop-blur-md p-3 space-y-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-white/90">Эффекты</span>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xs">Закрыть</button>
        </div>
        {REEL_EFFECT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => {
              onEffectPresetChange(preset.id);
              onClose();
              toast.success(`Эффект: ${preset.label}`);
            }}
            className={cn(
              'w-full rounded-lg px-2 py-2 text-left text-xs border transition-colors',
              reelEffectPreset === preset.id
                ? 'bg-blue-600/50 border-blue-300/50 text-white'
                : 'bg-white/5 border-white/10 text-white/90 hover:bg-white/10',
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>
    );
  }

  return null;
}

interface QuickToolButtonProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick: () => void;
}

export function QuickToolButton({ icon: Icon, label, active, onClick }: QuickToolButtonProps) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-0.5" aria-label={label}>
      <div className={cn(
        'w-9 h-9 rounded-full backdrop-blur-sm flex items-center justify-center border',
        active ? 'bg-blue-600/70 border-blue-300/60' : 'bg-black/30 border-transparent',
      )}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <span className="text-[10px] text-white/80 font-medium">{label}</span>
    </button>
  );
}

interface QuickToolsProps {
  activePanel: 'audio' | 'effects' | null;
  onPanelChange: (panel: 'audio' | 'effects' | null) => void;
  musicTitle: string;
  reelEffectPreset: string;
  reelFaceEnhance: boolean;
  reelAiEnhance: boolean;
  reelMaxDurationSec: 60 | 90;
  onMaxDurationToggle: () => void;
  onFaceEnhanceToggle: () => void;
  onAiEnhanceToggle: () => void;
  onLoadAudioTracks: (query?: string) => Promise<void>;
  audioQuery: string;
}

export function QuickTools({
  activePanel,
  onPanelChange,
  musicTitle,
  reelEffectPreset,
  reelFaceEnhance,
  reelAiEnhance,
  reelMaxDurationSec,
  onMaxDurationToggle,
  onFaceEnhanceToggle,
  onAiEnhanceToggle,
  onLoadAudioTracks,
  audioQuery,
}: QuickToolsProps) {
  return (
    <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-5">
      <QuickToolButton
        icon={Music2}
        label={musicTitle ? 'Аудио' : 'Аудио'}
        active={activePanel === 'audio' || !!musicTitle}
        onClick={() => {
          onPanelChange(activePanel === 'audio' ? null : 'audio');
          void onLoadAudioTracks(audioQuery);
        }}
      />
      <QuickToolButton
        icon={Sparkles}
        label="Эффекты"
        active={activePanel === 'effects' || reelEffectPreset !== 'none'}
        onClick={() => onPanelChange(activePanel === 'effects' ? null : 'effects')}
      />
      <QuickToolButton
        icon={Timer}
        label={`${reelMaxDurationSec}с`}
        active={reelMaxDurationSec === 90}
        onClick={() => {
          onMaxDurationToggle();
          toast.success(`Ограничение: ${reelMaxDurationSec === 60 ? 90 : 60}с`);
        }}
      />
      <QuickToolButton
        icon={User}
        label="Лицо"
        active={reelFaceEnhance}
        onClick={() => {
          onFaceEnhanceToggle();
          toast.success(`Режим лица: ${!reelFaceEnhance ? 'включен' : 'выключен'}`);
        }}
      />
      <QuickToolButton
        icon={Wand2}
        label="AI"
        active={reelAiEnhance}
        onClick={() => {
          onAiEnhanceToggle();
          toast.success(`AI-режим: ${!reelAiEnhance ? 'включен' : 'выключен'}`);
        }}
      />
    </div>
  );
}
