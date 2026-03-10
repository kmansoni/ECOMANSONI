/**
 * RenderDialog.tsx — Модалка экспорта: настройки + прогресс рендеринга.
 */

import React, { useCallback, useState, useMemo } from 'react';
import { Download, X, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUIStore } from '../../stores/ui-store';
import { EXPORT_PRESETS, DEFAULT_FPS_OPTIONS, type ExportPreset } from '../../constants';
import type { RenderStatus, RenderLogEvent } from '../../types';

interface RenderState {
  status: RenderStatus;
  progress: number;
  phase: string;
  logs: RenderLogEvent[];
  outputUrl: string | null;
}

const PLATFORM_PRESETS = [
  { id: 'custom', label: 'Произвольный' },
  { id: 'instagram_reels', label: 'Instagram Reels' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'youtube_short', label: 'YouTube Short' },
  { id: 'youtube', label: 'YouTube' },
];

const QUALITY_OPTIONS = [
  { value: 'low', label: 'Низкое' },
  { value: 'medium', label: 'Среднее' },
  { value: 'high', label: 'Высокое' },
  { value: 'ultra', label: 'Максимальное' },
];

export const RenderDialog = React.memo(function RenderDialog() {
  const isOpen = useUIStore((s) => s.isRenderDialogOpen);
  const closeDialog = useUIStore((s) => s.closeRenderDialog);

  const [selectedPreset, setSelectedPreset] = useState<string>('social-1080p');
  const [format, setFormat] = useState<'mp4' | 'webm' | 'mov' | 'gif'>('mp4');
  const [resolution, setResolution] = useState('1080p');
  const [fps, setFps] = useState(30);
  const [codec, setCodec] = useState('h264');
  const [quality, setQuality] = useState('high');
  const [platform, setPlatform] = useState('custom');
  const [activeTab, setActiveTab] = useState('settings');

  const [renderState, setRenderState] = useState<RenderState>({
    status: 'queued',
    progress: 0,
    phase: '',
    logs: [],
    outputUrl: null,
  });

  const handlePresetChange = useCallback((presetId: string) => {
    setSelectedPreset(presetId);
    const preset = EXPORT_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setFormat(preset.format);
      setResolution(preset.resolution);
      setFps(preset.fps);
      setCodec(preset.codec);
    }
  }, []);

  const handleStartRender = useCallback(() => {
    setActiveTab('progress');
    setRenderState({
      status: 'processing',
      progress: 0,
      phase: 'Подготовка...',
      logs: [{
        id: 1,
        job_id: 'local',
        level: 'info',
        message: 'Рендеринг начат',
        created_at: new Date().toISOString(),
      }],
      outputUrl: null,
    });

    // Simulate render progress
    let progress = 0;
    const phases: Array<{ name: string; status: RenderStatus; maxProgress: number }> = [
      { name: 'Обработка клипов...', status: 'processing', maxProgress: 30 },
      { name: 'Композитинг...', status: 'compositing', maxProgress: 60 },
      { name: 'Кодирование...', status: 'encoding', maxProgress: 90 },
      { name: 'Загрузка...', status: 'uploading', maxProgress: 100 },
    ];

    let phaseIndex = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 3 + 1;

      if (phaseIndex < phases.length - 1 && progress >= phases[phaseIndex].maxProgress) {
        phaseIndex++;
      }

      const currentPhase = phases[phaseIndex];

      if (progress >= 100) {
        clearInterval(interval);
        setRenderState((prev) => ({
          ...prev,
          status: 'completed',
          progress: 100,
          phase: 'Завершено!',
          outputUrl: '#download-mock',
          logs: [
            ...prev.logs,
            {
              id: prev.logs.length + 1,
              job_id: 'local',
              level: 'info',
              message: 'Рендеринг завершён успешно',
              created_at: new Date().toISOString(),
            },
          ],
        }));
        return;
      }

      setRenderState((prev) => ({
        ...prev,
        status: currentPhase.status,
        progress: Math.min(progress, 99),
        phase: currentPhase.name,
      }));
    }, 200);

    return () => clearInterval(interval);
  }, []);

  const handleCancel = useCallback(() => {
    setRenderState((prev) => ({
      ...prev,
      status: 'cancelled',
      phase: 'Отменено',
    }));
  }, []);

  const isRendering = renderState.status === 'processing' || renderState.status === 'compositing' ||
                      renderState.status === 'encoding' || renderState.status === 'uploading';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
      <DialogContent className="bg-[#111827] border-slate-700 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Download className="h-5 w-5" />
            Экспорт видео
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-[#1f2937] w-full">
            <TabsTrigger value="settings" className="flex-1 text-xs" disabled={isRendering}>
              Настройки
            </TabsTrigger>
            <TabsTrigger value="progress" className="flex-1 text-xs">
              Прогресс
            </TabsTrigger>
          </TabsList>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4 mt-4">
            {/* Preset */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Пресет</label>
              <Select value={selectedPreset} onValueChange={handlePresetChange}>
                <SelectTrigger className="bg-[#1f2937] border-slate-700 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1f2937] border-slate-700">
                  {EXPORT_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id} className="text-xs">
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Format */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400">Формат</label>
                <Select value={format} onValueChange={(v) => setFormat(v as typeof format)}>
                  <SelectTrigger className="bg-[#1f2937] border-slate-700 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1f2937] border-slate-700">
                    {['mp4', 'webm', 'mov', 'gif'].map((f) => (
                      <SelectItem key={f} value={f} className="text-xs uppercase">{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Resolution */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400">Разрешение</label>
                <Select value={resolution} onValueChange={setResolution}>
                  <SelectTrigger className="bg-[#1f2937] border-slate-700 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1f2937] border-slate-700">
                    {['480p', '720p', '1080p', '4k'].map((r) => (
                      <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* FPS */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400">FPS</label>
                <Select value={String(fps)} onValueChange={(v) => setFps(parseInt(v))}>
                  <SelectTrigger className="bg-[#1f2937] border-slate-700 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1f2937] border-slate-700">
                    {DEFAULT_FPS_OPTIONS.map((f) => (
                      <SelectItem key={f} value={String(f)} className="text-xs">{f} fps</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Quality */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400">Качество</label>
                <Select value={quality} onValueChange={setQuality}>
                  <SelectTrigger className="bg-[#1f2937] border-slate-700 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1f2937] border-slate-700">
                    {QUALITY_OPTIONS.map((q) => (
                      <SelectItem key={q.value} value={q.value} className="text-xs">{q.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Platform preset */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Платформа</label>
              <div className="flex flex-wrap gap-1.5">
                {PLATFORM_PRESETS.map((p) => (
                  <Button
                    key={p.id}
                    variant={platform === p.id ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setPlatform(p.id)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>

            <Button
              className="w-full bg-indigo-600 hover:bg-indigo-700 gap-2"
              onClick={handleStartRender}
            >
              <Download className="h-4 w-4" />
              Начать экспорт
            </Button>
          </TabsContent>

          {/* Progress Tab */}
          <TabsContent value="progress" className="mt-4 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{renderState.phase}</span>
                <span className="text-xs font-mono text-white">
                  {Math.round(renderState.progress)}%
                </span>
              </div>
              <Progress value={renderState.progress} className="h-2" />
            </div>

            {/* Status indicator */}
            <div className="flex items-center gap-2">
              {isRendering && <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />}
              {renderState.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-400" />}
              {renderState.status === 'failed' && <AlertCircle className="h-4 w-4 text-red-400" />}
              {renderState.status === 'cancelled' && <X className="h-4 w-4 text-yellow-400" />}
              <span className="text-xs text-slate-300 capitalize">{renderState.status}</span>
            </div>

            {/* Logs */}
            <ScrollArea className="h-32 bg-[#0a0a1a] rounded-lg p-2">
              <div className="font-mono text-[10px] space-y-0.5">
                {renderState.logs.map((log) => (
                  <div
                    key={log.id}
                    className={
                      log.level === 'error' ? 'text-red-400' :
                      log.level === 'warn' ? 'text-yellow-400' :
                      'text-green-400'
                    }
                  >
                    [{new Date(log.created_at).toLocaleTimeString()}] {log.message}
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Actions */}
            <div className="flex gap-2">
              {isRendering && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                  onClick={handleCancel}
                >
                  Отменить
                </Button>
              )}

              {renderState.status === 'completed' && (
                <>
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700 gap-1.5"
                    size="sm"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Скачать
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 border-slate-600 gap-1.5"
                  >
                    Опубликовать как Reel
                  </Button>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
});
