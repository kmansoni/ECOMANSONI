/**
 * TransitionsPanel.tsx — Правая панель: переходы.
 * Grid из доступных переходов с анимированным preview.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Shuffle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useEditorStore } from '../../stores/editor-store';
import { useTimelineStore } from '../../stores/timeline-store';
import { SliderControl } from '../shared/SliderControl';
import { TRANSITION_TYPES, type TransitionType } from '../../constants';

interface TransitionPreset {
  type: TransitionType;
  label: string;
  category: string;
}

const TRANSITION_PRESETS: TransitionPreset[] = [
  { type: 'fade', label: 'Плавное', category: 'fade' },
  { type: 'dissolve', label: 'Растворение', category: 'fade' },
  { type: 'crossfade', label: 'Перекрёстное', category: 'fade' },
  { type: 'wipe_left', label: 'Шторка ←', category: 'wipe' },
  { type: 'wipe_right', label: 'Шторка →', category: 'wipe' },
  { type: 'wipe_up', label: 'Шторка ↑', category: 'wipe' },
  { type: 'wipe_down', label: 'Шторка ↓', category: 'wipe' },
  { type: 'slide_left', label: 'Сдвиг ←', category: 'slide' },
  { type: 'slide_right', label: 'Сдвиг →', category: 'slide' },
  { type: 'slide_up', label: 'Сдвиг ↑', category: 'slide' },
  { type: 'slide_down', label: 'Сдвиг ↓', category: 'slide' },
  { type: 'circle_reveal', label: 'Круг', category: 'circle' },
  { type: 'diamond_reveal', label: 'Ромб', category: 'circle' },
  { type: 'zoom_in', label: 'Зум +', category: 'special' },
  { type: 'zoom_out', label: 'Зум −', category: 'special' },
  { type: 'glitch', label: 'Глитч', category: 'special' },
  { type: 'flash', label: 'Вспышка', category: 'special' },
  { type: 'blur', label: 'Размытие', category: 'special' },
  { type: 'pixelate', label: 'Пиксели', category: 'special' },
];

const CATEGORIES = [
  { value: 'all', label: 'Все' },
  { value: 'fade', label: 'Плавные' },
  { value: 'wipe', label: 'Шторка' },
  { value: 'slide', label: 'Сдвиг' },
  { value: 'circle', label: 'Фигуры' },
  { value: 'special', label: 'Особые' },
];

export const TransitionsPanel = React.memo(function TransitionsPanel() {
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds);
  const getClipById = useEditorStore((s) => s.getClipById);
  const updateClipLocal = useEditorStore((s) => s.updateClipLocal);

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [transitionDuration, setTransitionDuration] = useState(500);
  const [applyTarget, setApplyTarget] = useState<'in' | 'out'>('in');

  const selectedClipId = useMemo(() => {
    const ids = Array.from(selectedClipIds);
    return ids.length === 1 ? ids[0] : null;
  }, [selectedClipIds]);

  const clip = selectedClipId ? getClipById(selectedClipId) : undefined;

  const filtered = useMemo(() => {
    if (selectedCategory === 'all') return TRANSITION_PRESETS;
    return TRANSITION_PRESETS.filter((t) => t.category === selectedCategory);
  }, [selectedCategory]);

  const currentTransition = useMemo(() => {
    if (!clip) return null;
    return applyTarget === 'in' ? clip.transition_in?.type : clip.transition_out?.type;
  }, [clip, applyTarget]);

  const handleApply = useCallback(
    (preset: TransitionPreset) => {
      if (!clip) return;

      const config = { type: preset.type, duration_ms: transitionDuration };

      if (applyTarget === 'in') {
        updateClipLocal(clip.id, {
          transition_in: currentTransition === preset.type ? null : config,
        });
      } else {
        updateClipLocal(clip.id, {
          transition_out: currentTransition === preset.type ? null : config,
        });
      }
    },
    [clip, applyTarget, transitionDuration, currentTransition, updateClipLocal],
  );

  if (!clip) {
    return (
      <div className="flex items-center justify-center h-full text-slate-600">
        <div className="text-center">
          <Shuffle className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-xs">Выберите клип для добавления перехода</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full" role="region" aria-label="Переходы">
      <div className="p-3 space-y-3">
        <h3 className="text-sm font-medium text-white">Переходы</h3>

        {/* In / Out toggle */}
        <div className="flex gap-1 bg-[#1f2937] rounded-lg p-0.5">
          <button
            type="button"
            className={cn(
              'flex-1 text-xs py-1 rounded-md transition-colors',
              applyTarget === 'in' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white',
            )}
            onClick={() => setApplyTarget('in')}
          >
            Вход
          </button>
          <button
            type="button"
            className={cn(
              'flex-1 text-xs py-1 rounded-md transition-colors',
              applyTarget === 'out' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white',
            )}
            onClick={() => setApplyTarget('out')}
          >
            Выход
          </button>
        </div>

        <SliderControl
          label="Длительность"
          value={transitionDuration}
          min={100}
          max={3000}
          step={50}
          unit="мс"
          onChange={setTransitionDuration}
        />

        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              className={cn(
                'text-[10px] px-2 py-0.5 rounded',
                selectedCategory === cat.value
                  ? 'bg-indigo-600/20 text-indigo-300'
                  : 'text-slate-500 hover:text-white',
              )}
              onClick={() => setSelectedCategory(cat.value)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {filtered.map((preset) => (
            <button
              key={preset.type}
              type="button"
              className={cn(
                'rounded-lg border-2 p-2 text-center transition-all',
                currentTransition === preset.type
                  ? 'border-indigo-500 bg-indigo-600/10'
                  : 'border-transparent bg-[#1f2937] hover:border-slate-600',
              )}
              onClick={() => handleApply(preset)}
              aria-label={`Переход: ${preset.label}`}
              aria-pressed={currentTransition === preset.type}
            >
              <div className="h-8 mb-1 flex items-center justify-center">
                <div
                  className="w-6 h-6 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-sm"
                  style={{
                    animation: 'pulse 2s ease-in-out infinite',
                  }}
                />
              </div>
              <span className="text-[9px] text-slate-400 leading-tight block">{preset.label}</span>
            </button>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
});
