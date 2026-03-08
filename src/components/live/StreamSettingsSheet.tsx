import React, { useState } from 'react';
import { Copy, RefreshCw, Eye, EyeOff } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import type { StreamSettings } from '@/stores/livestreamStore';

interface ChatSettings {
  slowMode: boolean;
  followersOnly: boolean;
  linksAllowed: boolean;
}

interface StreamSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  streamKey?: string;
  rtmpUrl?: string;
  settings: StreamSettings;
  onUpdateSettings: (partial: Partial<StreamSettings>) => void;
  onRotateKey?: () => Promise<void>;
}

/**
 * Bottom sheet with all stream configuration options.
 */
export function StreamSettingsSheet({
  open,
  onOpenChange,
  streamKey,
  rtmpUrl = 'rtmp://ingest.example.com/live',
  settings,
  onUpdateSettings,
  onRotateKey,
}: StreamSettingsSheetProps) {
  const [keyVisible, setKeyVisible] = useState(false);
  const [chatSettings, setChatSettings] = useState<ChatSettings>({
    slowMode: false,
    followersOnly: false,
    linksAllowed: true,
  });
  const [rotating, setRotating] = useState(false);

  const maskedKey = streamKey
    ? `sk_live_${'•'.repeat(12)}${streamKey.slice(-4)}`
    : '—';

  const handleCopyKey = () => {
    if (!streamKey) return;
    void navigator.clipboard.writeText(streamKey);
    toast.success('Stream key copied');
  };

  const handleCopyRtmp = () => {
    void navigator.clipboard.writeText(rtmpUrl);
    toast.success('RTMP URL copied');
  };

  const handleRotate = async () => {
    if (!onRotateKey || rotating) return;
    setRotating(true);
    try {
      await onRotateKey();
    } finally {
      setRotating(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-zinc-900 text-white border-zinc-700 pb-safe max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-white">Настройки стрима</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {/* Stream key */}
          <section>
            <h3 className="text-sm font-semibold text-zinc-300 mb-2">Stream key</h3>
            <div className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2">
              <span className="flex-1 font-mono text-xs text-zinc-300 truncate">
                {keyVisible && streamKey ? streamKey : maskedKey}
              </span>
              <button
                onClick={() => setKeyVisible((v) => !v)}
                className="text-zinc-400 hover:text-white"
                aria-label={keyVisible ? 'Hide stream key' : 'Show stream key'}
              >
                {keyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button onClick={handleCopyKey} className="text-zinc-400 hover:text-white" aria-label="Copy stream key">
                <Copy className="h-4 w-4" />
              </button>
              {onRotateKey && (
                <button
                  onClick={() => void handleRotate()}
                  disabled={rotating}
                  className="text-zinc-400 hover:text-white disabled:opacity-40"
                  aria-label="Rotate stream key"
                >
                  <RefreshCw className={`h-4 w-4 ${rotating ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
          </section>

          {/* RTMP URL */}
          <section>
            <h3 className="text-sm font-semibold text-zinc-300 mb-2">RTMP URL</h3>
            <div className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2">
              <span className="flex-1 font-mono text-xs text-zinc-300 truncate">{rtmpUrl}</span>
              <button onClick={handleCopyRtmp} className="text-zinc-400 hover:text-white" aria-label="Copy RTMP URL">
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </section>

          {/* Video quality */}
          <section>
            <h3 className="text-sm font-semibold text-zinc-300 mb-2">Качество видео</h3>
            <Select
              value={settings.quality}
              onValueChange={(v) => onUpdateSettings({ quality: v as StreamSettings['quality'] })}
            >
              <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white">
                <SelectValue placeholder="Выберите качество" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                {(['1080p', '720p', '480p', '360p'] as const).map((q) => (
                  <SelectItem key={q} value={q}>{q}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          {/* Frame rate */}
          <section>
            <h3 className="text-sm font-semibold text-zinc-300 mb-2">Частота кадров</h3>
            <Select
              value={String(settings.frameRate)}
              onValueChange={(v) => onUpdateSettings({ frameRate: Number(v) as StreamSettings['frameRate'] })}
            >
              <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                {[15, 24, 30, 60].map((fr) => (
                  <SelectItem key={fr} value={String(fr)}>{fr} fps</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          {/* Chat settings */}
          <section>
            <h3 className="text-sm font-semibold text-zinc-300 mb-3">Настройки чата</h3>
            <div className="space-y-3">
              {([
                { key: 'slowMode', label: 'Медленный режим (30 с)', desc: 'Одно сообщение в 30 секунд' },
                { key: 'followersOnly', label: 'Только подписчики' , desc: 'Только ваши подписчики могут писать' },
                { key: 'linksAllowed', label: 'Разрешить ссылки', desc: 'Пользователи могут отправлять ссылки' },
              ] as const).map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm text-white">{label}</Label>
                    <p className="text-xs text-zinc-500">{desc}</p>
                  </div>
                  <Switch
                    checked={chatSettings[key]}
                    onCheckedChange={(v) => setChatSettings((s) => ({ ...s, [key]: v }))}
                    aria-label={label}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Background blur */}
          <section className="flex items-center justify-between">
            <div>
              <Label className="text-sm text-white">Размытие фона</Label>
              <p className="text-xs text-zinc-500">Требует поддержки WASM</p>
            </div>
            <Switch
              checked={settings.backgroundBlur}
              onCheckedChange={(v) => onUpdateSettings({ backgroundBlur: v })}
              aria-label="Background blur"
            />
          </section>

          {/* Noise suppression */}
          <section className="flex items-center justify-between">
            <div>
              <Label className="text-sm text-white">Шумоподавление</Label>
            </div>
            <Switch
              checked={settings.noiseSuppression}
              onCheckedChange={(v) => onUpdateSettings({ noiseSuppression: v })}
              aria-label="Noise suppression"
            />
          </section>

          <Button
            className="w-full"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Готово
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
