import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useCreateContent } from '../CreateContentContext';

const REEL_EFFECT_PRESETS = [
  { id: 'none', label: 'Без эффекта' },
  { id: 'cinematic', label: 'Кино' },
  { id: 'vintage', label: 'Винтаж' },
  { id: 'vivid', label: 'Яркий' },
] as const;

interface QuickPanelsProps {
  onLoadAudioTracks: (query?: string) => Promise<void>;
  audioTracks: Array<{ id: string; title: string; artist?: string | null }>;
  isAudioLoading: boolean;
  audioQuery: string;
  setAudioQuery: (v: string) => void;
}

export function QuickPanels({
  onLoadAudioTracks,
  audioTracks,
  isAudioLoading,
  audioQuery,
  setAudioQuery,
}: QuickPanelsProps) {
  const {
    quickPanel,
    setQuickPanel,
    selectedMusicTrackId,
    setSelectedMusicTrackId,
    setMusicTitle,
    reelEffectPreset,
    setReelEffectPreset,
  } = useCreateContent();

  return (
    <>
      {/* Audio panel */}
      {quickPanel === 'audio' && (
        <div className="absolute left-14 top-1/2 -translate-y-1/2 z-20 w-72 rounded-2xl border border-white/20 bg-black/60 backdrop-blur-md p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/90">Выбор аудио</span>
            <button onClick={() => setQuickPanel(null)} className="text-white/70 hover:text-white text-xs">Закрыть</button>
          </div>
          <Input
            value={audioQuery}
            onChange={(e) => setAudioQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void onLoadAudioTracks(audioQuery); }}
            placeholder="Поиск по трекам"
            className="h-8 bg-white/10 border-white/20 text-white placeholder:text-white/50"
          />
          <div className="max-h-48 overflow-y-auto space-y-1">
            {isAudioLoading ? (
              <div className="flex items-center gap-2 text-white/70 text-xs py-3 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Загрузка...
              </div>
            ) : audioTracks.length === 0 ? (
              <p className="text-xs text-white/60 py-2 text-center">Нет результатов</p>
            ) : (
              audioTracks.map((track) => (
                <button
                  key={track.id}
                  onClick={() => {
                    setSelectedMusicTrackId(track.id);
                    setMusicTitle([track.artist, track.title].filter(Boolean).join(' — '));
                    setQuickPanel(null);
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
      )}

      {/* Effects panel */}
      {quickPanel === 'effects' && (
        <div className="absolute left-14 top-1/2 -translate-y-1/2 z-20 w-56 rounded-2xl border border-white/20 bg-black/60 backdrop-blur-md p-3 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-white/90">Эффекты</span>
            <button onClick={() => setQuickPanel(null)} className="text-white/70 hover:text-white text-xs">Закрыть</button>
          </div>
          {REEL_EFFECT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => {
                setReelEffectPreset(preset.id);
                setQuickPanel(null);
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
      )}
    </>
  );
}
