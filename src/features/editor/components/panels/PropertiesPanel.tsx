/**
 * PropertiesPanel.tsx — Правая панель: свойства выбранного клипа.
 * Position, Scale, Rotation, Opacity, Speed, Volume, Flip, Crop, Text styling.
 */

import React, { useCallback, useMemo } from 'react';
import { FlipHorizontal, FlipVertical, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEditorStore } from '../../stores/editor-store';
import { useTimelineStore } from '../../stores/timeline-store';
import { SliderControl } from '../shared/SliderControl';
import { ColorPicker } from '../shared/ColorPicker';
import { DEFAULT_CLIP_TRANSFORM } from '../../constants';
import type { ClipWithDetails } from '../../types';

export const PropertiesPanel = React.memo(function PropertiesPanel() {
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds);
  const getClipById = useEditorStore((s) => s.getClipById);
  const updateClipLocal = useEditorStore((s) => s.updateClipLocal);

  const selectedClipId = useMemo(() => {
    const ids = Array.from(selectedClipIds);
    return ids.length === 1 ? ids[0] : null;
  }, [selectedClipIds]);

  const clip = selectedClipId ? getClipById(selectedClipId) : undefined;

  const updateTransform = useCallback(
    (key: keyof ClipWithDetails['transform'], value: number) => {
      if (!clip) return;
      updateClipLocal(clip.id, {
        transform: { ...clip.transform, [key]: value },
      });
    },
    [clip, updateClipLocal],
  );

  const updateField = useCallback(
    (updates: Partial<ClipWithDetails>) => {
      if (!clip) return;
      updateClipLocal(clip.id, updates);
    },
    [clip, updateClipLocal],
  );

  const handleResetTransform = useCallback(() => {
    if (!clip) return;
    updateClipLocal(clip.id, { transform: { ...DEFAULT_CLIP_TRANSFORM } });
  }, [clip, updateClipLocal]);

  const handleFlipH = useCallback(() => {
    if (!clip) return;
    updateClipLocal(clip.id, {
      transform: { ...clip.transform, scale: clip.transform.scale * -1 },
    });
  }, [clip, updateClipLocal]);

  if (!clip) {
    return (
      <div className="flex items-center justify-center h-full text-slate-600">
        <div className="text-center">
          <p className="text-sm">Выберите клип</p>
          <p className="text-xs mt-1">для редактирования свойств</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full" role="region" aria-label="Свойства клипа">
      <div className="p-3 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-white truncate">{clip.name}</h3>
          <span className="text-[10px] text-slate-500 uppercase">{clip.type}</span>
        </div>

        <Separator className="bg-slate-800" />

        {/* Transform */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-400">Трансформация</Label>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-slate-500 hover:text-white"
              onClick={handleResetTransform}
              aria-label="Сбросить трансформацию"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-slate-500">X</Label>
              <Input
                type="number"
                value={Math.round(clip.transform.x)}
                onChange={(e) => updateTransform('x', parseFloat(e.target.value) || 0)}
                className="h-7 bg-[#1f2937] border-slate-700 text-xs font-mono"
                aria-label="Позиция X"
              />
            </div>
            <div>
              <Label className="text-[10px] text-slate-500">Y</Label>
              <Input
                type="number"
                value={Math.round(clip.transform.y)}
                onChange={(e) => updateTransform('y', parseFloat(e.target.value) || 0)}
                className="h-7 bg-[#1f2937] border-slate-700 text-xs font-mono"
                aria-label="Позиция Y"
              />
            </div>
          </div>

          <SliderControl
            label="Масштаб"
            value={clip.transform.scale}
            min={0.1}
            max={5}
            step={0.05}
            unit="×"
            onChange={(v) => updateTransform('scale', v)}
          />

          <SliderControl
            label="Поворот"
            value={clip.transform.rotation}
            min={-360}
            max={360}
            step={1}
            unit="°"
            onChange={(v) => updateTransform('rotation', v)}
          />
        </div>

        <Separator className="bg-slate-800" />

        {/* Opacity & Speed & Volume */}
        <div className="space-y-3">
          <SliderControl
            label="Непрозрачность"
            value={Math.round((clip.volume ?? 1) * 100)}
            min={0}
            max={100}
            step={1}
            unit="%"
            onChange={(v) => updateField({ volume: v / 100 })}
          />

          <SliderControl
            label="Скорость"
            value={clip.speed}
            min={0.1}
            max={10}
            step={0.1}
            unit="×"
            onChange={(v) => updateField({ speed: v })}
          />

          <SliderControl
            label="Громкость"
            value={Math.round(clip.volume * 200)}
            min={0}
            max={200}
            step={1}
            unit="%"
            onChange={(v) => updateField({ volume: v / 200 })}
          />
        </div>

        {/* Flip buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-7 text-xs border-slate-700 text-slate-400 hover:text-white gap-1"
            onClick={handleFlipH}
          >
            <FlipHorizontal className="h-3 w-3" /> Горизонтально
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-7 text-xs border-slate-700 text-slate-400 hover:text-white gap-1"
            onClick={() => { /* flip vertical requires Y-axis flip logic */ }}
          >
            <FlipVertical className="h-3 w-3" /> Вертикально
          </Button>
        </div>

        {/* Crop */}
        {clip.crop && (
          <>
            <Separator className="bg-slate-800" />
            <div className="space-y-3">
              <Label className="text-xs text-slate-400">Обрезка</Label>
              <div className="grid grid-cols-2 gap-2">
                {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                  <SliderControl
                    key={side}
                    label={side === 'top' ? 'Сверху' : side === 'right' ? 'Справа' : side === 'bottom' ? 'Снизу' : 'Слева'}
                    value={clip.crop?.[side] ?? 0}
                    min={0}
                    max={50}
                    step={1}
                    unit="%"
                    onChange={(v) => {
                      updateField({
                        crop: { ...(clip.crop ?? { top: 0, right: 0, bottom: 0, left: 0 }), [side]: v },
                      });
                    }}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {/* Text-specific properties */}
        {clip.type === 'text' && clip.text_style && (
          <>
            <Separator className="bg-slate-800" />
            <div className="space-y-3">
              <Label className="text-xs text-slate-400">Текст</Label>

              <Input
                value={clip.text_content ?? ''}
                onChange={(e) => updateField({ text_content: e.target.value })}
                className="h-8 bg-[#1f2937] border-slate-700 text-xs"
                placeholder="Текст..."
                aria-label="Содержимое текста"
              />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-slate-500">Шрифт</Label>
                  <Select
                    value={clip.text_style.font_family}
                    onValueChange={(v) =>
                      updateField({ text_style: { ...clip.text_style!, font_family: v } })
                    }
                  >
                    <SelectTrigger className="h-7 bg-[#1f2937] border-slate-700 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1f2937] border-slate-700">
                      {['Inter', 'Arial', 'Roboto', 'Montserrat', 'Open Sans', 'Lato', 'Oswald', 'Playfair Display'].map((font) => (
                        <SelectItem key={font} value={font} className="text-xs">
                          {font}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[10px] text-slate-500">Размер</Label>
                  <Input
                    type="number"
                    value={clip.text_style.font_size}
                    onChange={(e) =>
                      updateField({
                        text_style: { ...clip.text_style!, font_size: parseInt(e.target.value) || 48 },
                      })
                    }
                    className="h-7 bg-[#1f2937] border-slate-700 text-xs font-mono"
                    aria-label="Размер шрифта"
                  />
                </div>
              </div>

              <ColorPicker
                label="Цвет текста"
                value={clip.text_style.color}
                onChange={(color) =>
                  updateField({ text_style: { ...clip.text_style!, color } })
                }
              />

              <div>
                <Label className="text-[10px] text-slate-500">Выравнивание</Label>
                <div className="flex gap-1 mt-1">
                  {(['left', 'center', 'right'] as const).map((align) => (
                    <Button
                      key={align}
                      variant={clip.text_style?.alignment === align ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1 h-6 text-[10px]"
                      onClick={() =>
                        updateField({ text_style: { ...clip.text_style!, alignment: align } })
                      }
                    >
                      {align === 'left' ? 'Лево' : align === 'center' ? 'Центр' : 'Право'}
                    </Button>
                  ))}
                </div>
              </div>

              {clip.text_style.background_color !== undefined && (
                <ColorPicker
                  label="Фон текста"
                  value={clip.text_style.background_color ?? '#000000'}
                  showOpacity
                  onChange={(color) =>
                    updateField({ text_style: { ...clip.text_style!, background_color: color } })
                  }
                />
              )}
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );
});
