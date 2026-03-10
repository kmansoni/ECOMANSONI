/**
 * FiltersPanel.tsx — Правая панель: фильтры и LUTs.
 */

import React, { useCallback, useMemo } from 'react';
import { Palette } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useEditorStore } from '../../stores/editor-store';
import { useTimelineStore } from '../../stores/timeline-store';

interface FilterPreset {
  id: string;
  name: string;
  category: string;
  cssFilter: string;
  thumbnail?: string;
}

const FILTER_PRESETS: FilterPreset[] = [
  { id: 'none', name: 'Оригинал', category: 'basic', cssFilter: 'none' },
  { id: 'vintage', name: 'Винтаж', category: 'basic', cssFilter: 'sepia(0.4) contrast(1.1) brightness(1.05)' },
  { id: 'bw', name: 'Ч/Б', category: 'basic', cssFilter: 'grayscale(1)' },
  { id: 'warm', name: 'Тёплый', category: 'color', cssFilter: 'sepia(0.2) saturate(1.3) brightness(1.1)' },
  { id: 'cold', name: 'Холодный', category: 'color', cssFilter: 'saturate(0.8) hue-rotate(180deg) brightness(1.05)' },
  { id: 'vivid', name: 'Яркий', category: 'color', cssFilter: 'saturate(1.5) contrast(1.1)' },
  { id: 'muted', name: 'Приглушённый', category: 'color', cssFilter: 'saturate(0.5) brightness(1.1)' },
  { id: 'faded', name: 'Выцветший', category: 'color', cssFilter: 'contrast(0.85) brightness(1.15) saturate(0.7)' },
  { id: 'dramatic', name: 'Драматичный', category: 'mood', cssFilter: 'contrast(1.4) brightness(0.9) saturate(1.2)' },
  { id: 'dreamy', name: 'Мечтательный', category: 'mood', cssFilter: 'brightness(1.15) contrast(0.9) saturate(0.8) blur(0.5px)' },
  { id: 'noir', name: 'Нуар', category: 'mood', cssFilter: 'grayscale(0.8) contrast(1.3) brightness(0.85)' },
  { id: 'cinema', name: 'Кино', category: 'mood', cssFilter: 'contrast(1.2) saturate(0.85) brightness(0.95)' },
];

const CATEGORIES = [
  { value: 'all', label: 'Все' },
  { value: 'basic', label: 'Основные' },
  { value: 'color', label: 'Цвет' },
  { value: 'mood', label: 'Настроение' },
];

export const FiltersPanel = React.memo(function FiltersPanel() {
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds);
  const getClipById = useEditorStore((s) => s.getClipById);
  const updateClipLocal = useEditorStore((s) => s.updateClipLocal);

  const [selectedCategory, setSelectedCategory] = React.useState<string>('all');

  const selectedClipId = useMemo(() => {
    const ids = Array.from(selectedClipIds);
    return ids.length === 1 ? ids[0] : null;
  }, [selectedClipIds]);

  const clip = selectedClipId ? getClipById(selectedClipId) : undefined;

  const currentFilter = useMemo(() => {
    if (!clip?.filters?.length) return 'none';
    const filterObj = clip.filters.find((f) => f.type === 'preset');
    return (filterObj?.params?.id as string) ?? 'none';
  }, [clip]);

  const filteredPresets = useMemo(() => {
    if (selectedCategory === 'all') return FILTER_PRESETS;
    return FILTER_PRESETS.filter((f) => f.category === selectedCategory);
  }, [selectedCategory]);

  const handleApplyFilter = useCallback(
    (preset: FilterPreset) => {
      if (!clip) return;
      if (preset.id === 'none') {
        updateClipLocal(clip.id, { filters: [] });
      } else {
        updateClipLocal(clip.id, {
          filters: [{ type: 'preset', params: { id: preset.id, css: preset.cssFilter } }],
        });
      }
    },
    [clip, updateClipLocal],
  );

  if (!clip) {
    return (
      <div className="flex items-center justify-center h-full text-slate-600">
        <div className="text-center">
          <Palette className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-xs">Выберите клип для применения фильтра</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full" role="region" aria-label="Фильтры">
      <div className="p-3 space-y-3">
        <h3 className="text-sm font-medium text-white">Фильтры</h3>

        <div className="flex gap-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              className={cn(
                'text-[10px] px-2 py-0.5 rounded',
                selectedCategory === cat.value
                  ? 'bg-violet-600/20 text-violet-300'
                  : 'text-slate-500 hover:text-white',
              )}
              onClick={() => setSelectedCategory(cat.value)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {filteredPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={cn(
                'rounded-lg overflow-hidden border-2 transition-all',
                currentFilter === preset.id
                  ? 'border-violet-500 ring-1 ring-violet-500'
                  : 'border-transparent hover:border-slate-600',
              )}
              onClick={() => handleApplyFilter(preset)}
              aria-label={`Фильтр: ${preset.name}`}
              aria-pressed={currentFilter === preset.id}
            >
              <div
                className="w-full aspect-video bg-gradient-to-br from-indigo-500 to-purple-600"
                style={{ filter: preset.cssFilter }}
              />
              <p className="text-[10px] text-slate-300 p-1 text-center">{preset.name}</p>
            </button>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
});
