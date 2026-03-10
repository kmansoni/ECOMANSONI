/**
 * ProjectSettingsDialog.tsx — Настройки проекта: разрешение, fps, aspect ratio.
 */

import React, { useCallback, useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEditorStore } from '../../stores/editor-store';
import { useUIStore } from '../../stores/ui-store';
import { DEFAULT_ASPECT_RATIOS, DEFAULT_FPS_OPTIONS } from '../../constants';
import type { AspectRatio } from '../../types';

export const ProjectSettingsDialog = React.memo(function ProjectSettingsDialog() {
  const isOpen = useUIStore((s) => s.isProjectSettingsOpen);
  const toggleDialog = useUIStore((s) => s.toggleProjectSettings);
  const project = useEditorStore((s) => s.project);
  const updateProjectLocal = useEditorStore((s) => s.updateProjectLocal);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [fps, setFps] = useState(30);
  const [resWidth, setResWidth] = useState(1080);
  const [resHeight, setResHeight] = useState(1920);
  const [bgColor, setBgColor] = useState('#000000');

  useEffect(() => {
    if (project) {
      setTitle(project.title);
      setDescription(project.description ?? '');
      setAspectRatio(project.aspect_ratio);
      setFps(project.fps);
      setResWidth(project.resolution_width);
      setResHeight(project.resolution_height);
      setBgColor(project.settings?.background_color ?? '#000000');
    }
  }, [project, isOpen]);

  const handleAspectRatioChange = useCallback((value: string) => {
    const ar = value as AspectRatio;
    setAspectRatio(ar);
    const preset = DEFAULT_ASPECT_RATIOS.find((p) => p.value === ar);
    if (preset) {
      setResWidth(preset.width);
      setResHeight(preset.height);
    }
  }, []);

  const handleSave = useCallback(() => {
    updateProjectLocal({
      title: title.trim() || 'Без названия',
      description: description.trim() || null,
      aspect_ratio: aspectRatio,
      fps,
      resolution_width: resWidth,
      resolution_height: resHeight,
      settings: { background_color: bgColor },
    });
    toggleDialog();
  }, [title, description, aspectRatio, fps, resWidth, resHeight, bgColor, updateProjectLocal, toggleDialog]);

  return (
    <Dialog open={isOpen} onOpenChange={() => toggleDialog()}>
      <DialogContent className="bg-[#111827] border-slate-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Настройки проекта
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Название</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-[#1f2937] border-slate-700 text-sm"
              placeholder="Название проекта"
              aria-label="Название проекта"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Описание</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-[#1f2937] border-slate-700 text-sm"
              placeholder="Описание (необязательно)"
              aria-label="Описание проекта"
            />
          </div>

          {/* Aspect Ratio */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Соотношение сторон</Label>
            <div className="flex gap-1.5">
              {DEFAULT_ASPECT_RATIOS.map((ar) => (
                <Button
                  key={ar.value}
                  variant={aspectRatio === ar.value ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={() => handleAspectRatioChange(ar.value)}
                >
                  {ar.value}
                </Button>
              ))}
            </div>
          </div>

          {/* Resolution */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Ширина</Label>
              <Input
                type="number"
                value={resWidth}
                onChange={(e) => setResWidth(parseInt(e.target.value) || 1080)}
                className="bg-[#1f2937] border-slate-700 text-sm font-mono"
                aria-label="Ширина разрешения"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Высота</Label>
              <Input
                type="number"
                value={resHeight}
                onChange={(e) => setResHeight(parseInt(e.target.value) || 1920)}
                className="bg-[#1f2937] border-slate-700 text-sm font-mono"
                aria-label="Высота разрешения"
              />
            </div>
          </div>

          {/* FPS */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Частота кадров (FPS)</Label>
            <Select value={String(fps)} onValueChange={(v) => setFps(parseInt(v))}>
              <SelectTrigger className="bg-[#1f2937] border-slate-700 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1f2937] border-slate-700">
                {DEFAULT_FPS_OPTIONS.map((f) => (
                  <SelectItem key={f} value={String(f)} className="text-sm">
                    {f} fps
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Background color */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Цвет фона</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="h-8 w-8 rounded cursor-pointer border border-slate-700"
                aria-label="Цвет фона"
              />
              <Input
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="bg-[#1f2937] border-slate-700 text-sm font-mono flex-1"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={toggleDialog} className="border-slate-600">
            Отмена
          </Button>
          <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={handleSave}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
