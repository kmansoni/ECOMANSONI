import { Music2, Sparkles, Timer, User, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useCreateContent } from '../CreateContentContext';

const TOOLS = [
  { id: 'audio', Icon: Music2, label: 'Аудио', panelKey: 'audio' as const },
  { id: 'effects', Icon: Sparkles, label: 'Эффекты', panelKey: 'effects' as const },
  { id: 'duration', Icon: Timer, label: '60с', panelKey: null as const },
  { id: 'face', Icon: User, label: 'Лицо', panelKey: null as const },
  { id: 'ai', Icon: Wand2, label: 'AI', panelKey: null as const },
] as const;

export function CameraSidebarTools({
  onLoadAudioTracks,
}: {
  onLoadAudioTracks: (query?: string) => Promise<void>;
}) {
  const {
    cameraMode, isCameraAvailable, isTextStoryMode,
    quickPanel, setQuickPanel,
    reelEffectPreset,
    reelFaceEnhance, setReelFaceEnhance,
    reelAiEnhance, setReelAiEnhance,
    reelMaxRecordingMs, setReelMaxRecordingMs,
    audioQuery,
  } = useCreateContent();

  if (cameraMode !== 'camera' || !isCameraAvailable || isTextStoryMode) return null;

  return (
    <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-5">
      {TOOLS.map(({ id, Icon, label, panelKey }) => {
        const isActive = id === 'audio'
          ? quickPanel === 'audio'
          : id === 'effects'
          ? quickPanel === 'effects' || reelEffectPreset !== 'none'
          : id === 'duration'
          ? reelMaxRecordingMs === 90
          : id === 'face'
          ? reelFaceEnhance
          : id === 'ai'
          ? reelAiEnhance
          : false;

        const handleClick = () => {
          if (panelKey !== null) {
            setQuickPanel(panelKey);
            if (panelKey === 'audio') void onLoadAudioTracks(audioQuery);
          } else if (id === 'duration') {
            const next = reelMaxRecordingMs === 60 ? 90 : 60;
            setReelMaxRecordingMs(next);
            toast.success(`Ограничение: ${next}с`);
          } else if (id === 'face') {
            setReelFaceEnhance(!reelFaceEnhance);
            toast.success(`Режим лица: ${!reelFaceEnhance ? 'включен' : 'выключен'}`);
          } else if (id === 'ai') {
            setReelAiEnhance(!reelAiEnhance);
            toast.success(`AI-режим: ${!reelAiEnhance ? 'включен' : 'выключен'}`);
          }
        };

        return (
          <button
            key={id}
            onClick={handleClick}
            className="flex flex-col items-center gap-0.5"
            aria-label={label}
          >
            <div
              className={cn(
                'w-9 h-9 rounded-full backdrop-blur-sm flex items-center justify-center border',
                isActive
                  ? 'bg-blue-600/70 border-blue-300/60'
                  : 'bg-black/30 border-transparent',
              )}
            >
              <Icon className="w-5 h-5 text-white" />
            </div>
            <span className="text-[10px] text-white/80 font-medium">
              {id === 'duration' ? `${reelMaxRecordingMs / 1000}с` : label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
