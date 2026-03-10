/**
 * EffectsPanel.tsx — Правая панель: эффекты с toggle и параметрами.
 */

import React, { useCallback, useMemo } from 'react';
import { Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useEditorStore } from '../../stores/editor-store';
import { useTimelineStore } from '../../stores/timeline-store';
import { SliderControl } from '../shared/SliderControl';
import { ColorPicker } from '../shared/ColorPicker';
import { EFFECT_TYPES } from '../../constants';
import type { EffectType, EditorEffect } from '../../types';

const EFFECT_LABELS: Record<EffectType, string> = {
  filter: 'Фильтры',
  color_adjust: 'Цвет',
  blur: 'Размытие',
  chroma_key: 'Хромакей',
  voice_effect: 'Голос',
  noise_reduce: 'Шумоподавление',
  speed_ramp: 'Скорость',
  stabilize: 'Стабилизация',
  ai_enhance: 'AI Улучшение',
};

const EFFECT_ICONS: Record<EffectType, string> = {
  filter: '🎨',
  color_adjust: '🌈',
  blur: '🌫️',
  chroma_key: '🟢',
  voice_effect: '🎤',
  noise_reduce: '🔇',
  speed_ramp: '⚡',
  stabilize: '📐',
  ai_enhance: '🤖',
};

interface EffectParamDef {
  key: string;
  label: string;
  type: 'number' | 'color' | 'boolean';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  defaultValue: number | string | boolean;
}

const EFFECT_PARAM_DEFS: Partial<Record<EffectType, EffectParamDef[]>> = {
  blur: [
    { key: 'radius', label: 'Радиус', type: 'number', min: 0, max: 100, step: 1, unit: 'px', defaultValue: 10 },
  ],
  color_adjust: [
    { key: 'brightness', label: 'Яркость', type: 'number', min: -100, max: 100, step: 1, unit: '', defaultValue: 0 },
    { key: 'contrast', label: 'Контраст', type: 'number', min: -100, max: 100, step: 1, unit: '', defaultValue: 0 },
    { key: 'saturation', label: 'Насыщенность', type: 'number', min: -100, max: 100, step: 1, unit: '', defaultValue: 0 },
    { key: 'temperature', label: 'Температура', type: 'number', min: -100, max: 100, step: 1, unit: '', defaultValue: 0 },
  ],
  chroma_key: [
    { key: 'color', label: 'Цвет', type: 'color', defaultValue: '#00ff00' },
    { key: 'tolerance', label: 'Допуск', type: 'number', min: 0, max: 100, step: 1, unit: '%', defaultValue: 40 },
    { key: 'softness', label: 'Мягкость', type: 'number', min: 0, max: 100, step: 1, unit: '%', defaultValue: 10 },
  ],
};

export const EffectsPanel = React.memo(function EffectsPanel() {
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds);
  const getClipById = useEditorStore((s) => s.getClipById);
  const updateEffectLocal = useEditorStore((s) => s.updateEffectLocal);
  const addEffectLocal = useEditorStore((s) => s.addEffectLocal);
  const removeEffectLocal = useEditorStore((s) => s.removeEffectLocal);

  const selectedClipId = useMemo(() => {
    const ids = Array.from(selectedClipIds);
    return ids.length === 1 ? ids[0] : null;
  }, [selectedClipIds]);

  const clip = selectedClipId ? getClipById(selectedClipId) : undefined;

  const handleToggleEffect = useCallback(
    (effectType: EffectType, existing: EditorEffect | undefined) => {
      if (!clip) return;
      if (existing) {
        updateEffectLocal(existing.id, { enabled: !existing.enabled });
      } else {
        const newEffect: EditorEffect = {
          id: `temp_effect_${Date.now()}`,
          clip_id: clip.id,
          project_id: clip.project_id,
          type: effectType,
          name: EFFECT_LABELS[effectType],
          params: {},
          enabled: true,
          sort_order: clip.effects.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        addEffectLocal(clip.id, newEffect);
      }
    },
    [clip, updateEffectLocal, addEffectLocal],
  );

  const handleParamChange = useCallback(
    (effectId: string, paramKey: string, value: number | string | boolean) => {
      const effect = clip?.effects.find((e) => e.id === effectId);
      if (!effect) return;
      updateEffectLocal(effectId, {
        params: { ...effect.params, [paramKey]: value },
      });
    },
    [clip, updateEffectLocal],
  );

  if (!clip) {
    return (
      <div className="flex items-center justify-center h-full text-slate-600">
        <div className="text-center">
          <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-xs">Выберите клип для добавления эффектов</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full" role="region" aria-label="Эффекты">
      <div className="p-3 space-y-1">
        <h3 className="text-sm font-medium text-white mb-3">Эффекты</h3>

        {EFFECT_TYPES.map((effectType) => {
          const existing = clip.effects.find((e) => e.type === effectType);
          const isEnabled = existing?.enabled ?? false;
          const paramDefs = EFFECT_PARAM_DEFS[effectType];

          return (
            <Collapsible key={effectType} defaultOpen={isEnabled}>
              <div className="bg-[#1f2937] rounded-lg overflow-hidden">
                <CollapsibleTrigger className="flex items-center w-full gap-2 px-3 py-2 hover:bg-slate-700 transition-colors">
                  <span className="text-sm">{EFFECT_ICONS[effectType]}</span>
                  <span className="text-xs text-slate-300 flex-1 text-left">
                    {EFFECT_LABELS[effectType]}
                  </span>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={() => handleToggleEffect(effectType, existing)}
                    onClick={(e) => e.stopPropagation()}
                    className="scale-75"
                    aria-label={`${isEnabled ? 'Отключить' : 'Включить'} ${EFFECT_LABELS[effectType]}`}
                  />
                </CollapsibleTrigger>

                {existing && isEnabled && paramDefs && (
                  <CollapsibleContent>
                    <div className="px-3 pb-3 pt-1 space-y-2 border-t border-slate-700/50">
                      {paramDefs.map((param) => {
                        const value = existing.params[param.key] ?? param.defaultValue;

                        if (param.type === 'number') {
                          return (
                            <SliderControl
                              key={param.key}
                              label={param.label}
                              value={value as number}
                              min={param.min ?? 0}
                              max={param.max ?? 100}
                              step={param.step ?? 1}
                              unit={param.unit}
                              onChange={(v) => handleParamChange(existing.id, param.key, v)}
                            />
                          );
                        }

                        if (param.type === 'color') {
                          return (
                            <ColorPicker
                              key={param.key}
                              label={param.label}
                              value={value as string}
                              onChange={(v) => handleParamChange(existing.id, param.key, v)}
                            />
                          );
                        }

                        if (param.type === 'boolean') {
                          return (
                            <div key={param.key} className="flex items-center justify-between">
                              <span className="text-xs text-slate-400">{param.label}</span>
                              <Switch
                                checked={value as boolean}
                                onCheckedChange={(v) => handleParamChange(existing.id, param.key, v)}
                                className="scale-75"
                              />
                            </div>
                          );
                        }

                        return null;
                      })}
                    </div>
                  </CollapsibleContent>
                )}
              </div>
            </Collapsible>
          );
        })}
      </div>
    </ScrollArea>
  );
});
