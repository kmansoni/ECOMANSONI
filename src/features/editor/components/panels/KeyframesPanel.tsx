/**
 * KeyframesPanel.tsx — Правая панель: кейфреймы выбранного клипа.
 * Управление анимацией свойств во времени.
 */

import React, { useCallback, useMemo } from 'react';
import { Plus, Trash2, Diamond } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useEditorStore } from '../../stores/editor-store';
import { useTimelineStore } from '../../stores/timeline-store';
import { SliderControl } from '../shared/SliderControl';
import { TimeDisplay } from '../shared/TimeDisplay';
import type { EditorKeyframe, EasingType } from '../../types';

const KEYFRAME_PROPERTIES = [
  { value: 'transform.x', label: 'Позиция X' },
  { value: 'transform.y', label: 'Позиция Y' },
  { value: 'transform.scale', label: 'Масштаб' },
  { value: 'transform.rotation', label: 'Поворот' },
  { value: 'opacity', label: 'Прозрачность' },
  { value: 'volume', label: 'Громкость' },
];

const EASING_OPTIONS: Array<{ value: EasingType; label: string }> = [
  { value: 'linear', label: 'Линейная' },
  { value: 'ease_in', label: 'Ускорение' },
  { value: 'ease_out', label: 'Замедление' },
  { value: 'ease_in_out', label: 'Плавная' },
  { value: 'bezier', label: 'Кривая Безье' },
];

export const KeyframesPanel = React.memo(function KeyframesPanel() {
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds);
  const currentTimeMs = useTimelineStore((s) => s.currentTimeMs);
  const selectedKeyframeIds = useTimelineStore((s) => s.selectedKeyframeIds);
  const selectKeyframe = useTimelineStore((s) => s.selectKeyframe);
  const seek = useTimelineStore((s) => s.seek);
  const getClipById = useEditorStore((s) => s.getClipById);
  const setKeyframesLocal = useEditorStore((s) => s.setKeyframesLocal);
  const removeKeyframeLocal = useEditorStore((s) => s.removeKeyframeLocal);

  const selectedClipId = useMemo(() => {
    const ids = Array.from(selectedClipIds);
    return ids.length === 1 ? ids[0] : null;
  }, [selectedClipIds]);

  const clip = selectedClipId ? getClipById(selectedClipId) : undefined;

  const keyframesByProperty = useMemo(() => {
    if (!clip) return new Map<string, EditorKeyframe[]>();
    const map = new Map<string, EditorKeyframe[]>();
    for (const kf of clip.keyframes) {
      const existing = map.get(kf.property) ?? [];
      existing.push(kf);
      map.set(kf.property, existing.sort((a, b) => a.time_ms - b.time_ms));
    }
    return map;
  }, [clip]);

  const handleAddKeyframe = useCallback(
    (property: string) => {
      if (!clip) return;

      const relativeTime = currentTimeMs - clip.start_ms;
      if (relativeTime < 0 || relativeTime > clip.duration_ms) return;

      const newKf: EditorKeyframe = {
        id: `temp_kf_${Date.now()}`,
        clip_id: clip.id,
        project_id: clip.project_id,
        property,
        time_ms: relativeTime,
        value: 0,
        easing: 'ease_in_out',
        bezier_points: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setKeyframesLocal(clip.id, [...clip.keyframes, newKf]);
    },
    [clip, currentTimeMs, setKeyframesLocal],
  );

  const handleDeleteKeyframe = useCallback(
    (kfId: string) => {
      removeKeyframeLocal(kfId);
    },
    [removeKeyframeLocal],
  );

  const handleEasingChange = useCallback(
    (kfId: string, easing: EasingType) => {
      if (!clip) return;
      const updated = clip.keyframes.map((kf) =>
        kf.id === kfId ? { ...kf, easing } : kf,
      );
      setKeyframesLocal(clip.id, updated);
    },
    [clip, setKeyframesLocal],
  );

  const handleValueChange = useCallback(
    (kfId: string, value: number) => {
      if (!clip) return;
      const updated = clip.keyframes.map((kf) =>
        kf.id === kfId ? { ...kf, value } : kf,
      );
      setKeyframesLocal(clip.id, updated);
    },
    [clip, setKeyframesLocal],
  );

  if (!clip) {
    return (
      <div className="flex items-center justify-center h-full text-slate-600">
        <div className="text-center">
          <Diamond className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-xs">Выберите клип для управления кейфреймами</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full" role="region" aria-label="Кейфреймы">
      <div className="p-3 space-y-3">
        <h3 className="text-sm font-medium text-white">Кейфреймы</h3>

        {KEYFRAME_PROPERTIES.map((prop) => {
          const kfs = keyframesByProperty.get(prop.value) ?? [];
          const hasKeyframes = kfs.length > 0;

          return (
            <div key={prop.value} className="bg-[#1f2937] rounded-lg p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-300">{prop.label}</span>
                <div className="flex items-center gap-1">
                  {hasKeyframes && (
                    <span className="text-[9px] text-indigo-400 bg-indigo-600/20 px-1 rounded">
                      {kfs.length}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-slate-500 hover:text-yellow-400"
                    onClick={() => handleAddKeyframe(prop.value)}
                    aria-label={`Добавить кейфрейм: ${prop.label}`}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {kfs.length > 0 && (
                <div className="space-y-1 mt-2">
                  {kfs.map((kf) => (
                    <div
                      key={kf.id}
                      className={cn(
                        'flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px] cursor-pointer',
                        selectedKeyframeIds.has(kf.id)
                          ? 'bg-indigo-600/20 text-indigo-300'
                          : 'hover:bg-slate-700 text-slate-400',
                      )}
                      onClick={() => selectKeyframe(kf.id)}
                      role="button"
                      aria-label={`Кейфрейм в ${kf.time_ms}ms`}
                    >
                      <Diamond className="h-2.5 w-2.5 text-yellow-400 flex-shrink-0" />

                      <button
                        type="button"
                        className="text-[10px] font-mono hover:text-white"
                        onClick={(e) => { e.stopPropagation(); seek(clip.start_ms + kf.time_ms); }}
                      >
                        <TimeDisplay timeMs={kf.time_ms} className="text-[10px]" />
                      </button>

                      <input
                        type="number"
                        value={kf.value}
                        onChange={(e) => handleValueChange(kf.id, parseFloat(e.target.value) || 0)}
                        className="w-14 h-4 bg-slate-800 border-0 text-[10px] font-mono text-right px-1 rounded"
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Значение кейфрейма"
                      />

                      <Select
                        value={kf.easing}
                        onValueChange={(v) => handleEasingChange(kf.id, v as EasingType)}
                      >
                        <SelectTrigger
                          className="h-4 w-14 border-0 bg-slate-800 text-[9px] px-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1f2937] border-slate-700">
                          {EASING_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value} className="text-[10px]">
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 text-slate-600 hover:text-red-400"
                        onClick={(e) => { e.stopPropagation(); handleDeleteKeyframe(kf.id); }}
                        aria-label="Удалить кейфрейм"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
});
