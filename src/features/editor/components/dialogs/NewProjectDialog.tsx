/**
 * NewProjectDialog.tsx — Создание нового проекта.
 */

import React, { useCallback, useState } from 'react';
import { Film, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
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
import { cn } from '@/lib/utils';
import { DEFAULT_ASPECT_RATIOS, DEFAULT_FPS_OPTIONS, DEFAULT_FPS } from '../../constants';
import type { AspectRatio, CreateProjectInput } from '../../types';

interface NewProjectDialogProps {
  onCreateProject: (input: CreateProjectInput) => void;
  trigger?: React.ReactNode;
}

export const NewProjectDialog = React.memo(function NewProjectDialog({
  onCreateProject,
  trigger,
}: NewProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [fps, setFps] = useState(DEFAULT_FPS);

  const selectedPreset = DEFAULT_ASPECT_RATIOS.find((p) => p.value === aspectRatio);

  const handleCreate = useCallback(() => {
    const input: CreateProjectInput = {
      title: title.trim() || 'Новый проект',
      description: description.trim() || undefined,
      aspect_ratio: aspectRatio,
      fps,
      resolution_width: selectedPreset?.width ?? 1080,
      resolution_height: selectedPreset?.height ?? 1920,
    };
    onCreateProject(input);
    setOpen(false);
    // Reset form
    setTitle('');
    setDescription('');
    setAspectRatio('9:16');
    setFps(DEFAULT_FPS);
  }, [title, description, aspectRatio, fps, selectedPreset, onCreateProject]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700">
            <Plus className="h-4 w-4" />
            Новый проект
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="bg-[#111827] border-slate-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Film className="h-5 w-5" />
            Новый проект
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
              placeholder="Мой проект"
              autoFocus
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

          {/* Aspect Ratio visual selector */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Формат</Label>
            <div className="grid grid-cols-5 gap-2">
              {DEFAULT_ASPECT_RATIOS.map((ar) => {
                const isSelected = aspectRatio === ar.value;
                const aspectNum = ar.width / ar.height;
                const previewWidth = 40;
                const previewHeight = previewWidth / aspectNum;

                return (
                  <button
                    key={ar.value}
                    type="button"
                    className={cn(
                      'flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-all',
                      isSelected
                        ? 'border-indigo-500 bg-indigo-600/10'
                        : 'border-transparent bg-[#1f2937] hover:border-slate-600',
                    )}
                    onClick={() => setAspectRatio(ar.value)}
                    aria-label={ar.label}
                    aria-pressed={isSelected}
                  >
                    <div
                      className={cn(
                        'rounded-sm border',
                        isSelected ? 'border-indigo-400 bg-indigo-600/20' : 'border-slate-600 bg-slate-800',
                      )}
                      style={{
                        width: `${Math.min(previewWidth, 40)}px`,
                        height: `${Math.min(previewHeight, 50)}px`,
                        maxHeight: '50px',
                        maxWidth: '40px',
                      }}
                    />
                    <span className="text-[9px] text-slate-400">{ar.value}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              {selectedPreset?.label} — {selectedPreset?.width}×{selectedPreset?.height}
            </p>
          </div>

          {/* FPS */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Частота кадров</Label>
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="border-slate-600">
            Отмена
          </Button>
          <Button className="bg-indigo-600 hover:bg-indigo-700 gap-1.5" onClick={handleCreate}>
            <Plus className="h-4 w-4" />
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
