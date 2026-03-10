/**
 * TextPanel.tsx — Левая панель: добавление текста.
 * Пресеты стилей текста для быстрого добавления на таймлайн.
 */

import React, { useCallback } from 'react';
import { Plus, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { TextStyle } from '../../types';
import { DEFAULT_TEXT_STYLE } from '../../constants';

interface TextPreset {
  id: string;
  label: string;
  style: TextStyle;
  previewText: string;
}

const TEXT_PRESETS: TextPreset[] = [
  {
    id: 'heading',
    label: 'Заголовок',
    style: { ...DEFAULT_TEXT_STYLE, font_size: 72, font_weight: 700 },
    previewText: 'Заголовок',
  },
  {
    id: 'subtitle',
    label: 'Подзаголовок',
    style: { ...DEFAULT_TEXT_STYLE, font_size: 48, font_weight: 500 },
    previewText: 'Подзаголовок',
  },
  {
    id: 'body',
    label: 'Основной текст',
    style: { ...DEFAULT_TEXT_STYLE, font_size: 36, font_weight: 400 },
    previewText: 'Основной текст',
  },
  {
    id: 'caption',
    label: 'Подпись',
    style: {
      ...DEFAULT_TEXT_STYLE,
      font_size: 28,
      font_weight: 400,
      background_color: 'rgba(0,0,0,0.7)',
    },
    previewText: 'Подпись видео',
  },
  {
    id: 'neon',
    label: 'Неон',
    style: {
      ...DEFAULT_TEXT_STYLE,
      font_size: 56,
      font_weight: 700,
      color: '#00ffff',
      shadow: { x: 0, y: 0, blur: 20, color: '#00ffff' },
      outline: { width: 2, color: '#0088ff' },
    },
    previewText: 'НЕОН',
  },
  {
    id: 'outline',
    label: 'Контурный',
    style: {
      ...DEFAULT_TEXT_STYLE,
      font_size: 60,
      font_weight: 800,
      color: 'transparent',
      outline: { width: 3, color: '#ffffff' },
    },
    previewText: 'КОНТУР',
  },
  {
    id: 'gradient',
    label: 'С тенью',
    style: {
      ...DEFAULT_TEXT_STYLE,
      font_size: 52,
      font_weight: 700,
      shadow: { x: 4, y: 4, blur: 8, color: 'rgba(0,0,0,0.8)' },
    },
    previewText: 'С ТЕНЬЮ',
  },
  {
    id: 'minimal',
    label: 'Минималистичный',
    style: {
      ...DEFAULT_TEXT_STYLE,
      font_size: 32,
      font_weight: 300,
      letter_spacing: 8,
    },
    previewText: 'МИНИМАЛИЗМ',
  },
];

interface TextPanelProps {
  onAddText: (text: string, style: TextStyle) => void;
}

export const TextPanel = React.memo(function TextPanel({ onAddText }: TextPanelProps) {
  const handleAddPreset = useCallback(
    (preset: TextPreset) => {
      onAddText(preset.previewText, preset.style);
    },
    [onAddText],
  );

  const handleAddCustom = useCallback(() => {
    onAddText('Введите текст', DEFAULT_TEXT_STYLE);
  }, [onAddText]);

  return (
    <div className="flex flex-col h-full" role="region" aria-label="Текст">
      <div className="p-3 border-b border-slate-800">
        <h3 className="text-sm font-medium text-white mb-2">Текст</h3>
        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 border-dashed border-slate-600 text-slate-400 hover:text-white hover:border-indigo-500 gap-2"
          onClick={handleAddCustom}
        >
          <Plus className="h-3.5 w-3.5" />
          Добавить текст
        </Button>
      </div>

      <ScrollArea className="flex-1 px-3">
        <div className="py-3 space-y-2">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Пресеты</p>
          {TEXT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="w-full p-3 bg-[#1f2937] rounded-lg hover:bg-slate-700 hover:ring-1 hover:ring-yellow-500/50 transition-all text-left group"
              onClick={() => handleAddPreset(preset)}
              aria-label={`Добавить текст в стиле: ${preset.label}`}
            >
              <div
                className="mb-1 truncate"
                style={{
                  fontFamily: preset.style.font_family,
                  fontSize: `${Math.min(preset.style.font_size / 3, 24)}px`,
                  fontWeight: preset.style.font_weight,
                  color: preset.style.color === 'transparent' ? '#ffffff' : preset.style.color,
                  letterSpacing: `${preset.style.letter_spacing / 4}px`,
                  textShadow: preset.style.shadow
                    ? `${preset.style.shadow.x}px ${preset.style.shadow.y}px ${preset.style.shadow.blur / 2}px ${preset.style.shadow.color}`
                    : undefined,
                  WebkitTextStroke: preset.style.outline?.width
                    ? `${preset.style.outline.width / 2}px ${preset.style.outline.color}`
                    : undefined,
                }}
              >
                {preset.previewText}
              </div>
              <span className="text-[10px] text-slate-500">{preset.label}</span>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
});
