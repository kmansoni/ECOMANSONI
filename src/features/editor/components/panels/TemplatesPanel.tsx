/**
 * TemplatesPanel.tsx — Левая панель: шаблоны проектов.
 */

import React, { useState, useMemo } from 'react';
import { Search, Sparkles, Crown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { EditorTemplate, TemplateCategory } from '../../types';

interface TemplatesPanelProps {
  templates: EditorTemplate[];
  onApplyTemplate: (template: EditorTemplate) => void;
}

const CATEGORY_OPTIONS: Array<{ value: TemplateCategory | 'all'; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'trending', label: '🔥 Тренды' },
  { value: 'social', label: '📱 Соц.сети' },
  { value: 'business', label: '💼 Бизнес' },
  { value: 'education', label: '📚 Обучение' },
  { value: 'music', label: '🎵 Музыка' },
  { value: 'gaming', label: '🎮 Игры' },
];

export const TemplatesPanel = React.memo(function TemplatesPanel({
  templates,
  onApplyTemplate,
}: TemplatesPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | 'all'>('all');

  const filtered = useMemo(() => {
    let result = templates;
    if (selectedCategory !== 'all') {
      result = result.filter((t) => t.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [templates, selectedCategory, searchQuery]);

  return (
    <div className="flex flex-col h-full" role="region" aria-label="Шаблоны">
      <div className="p-3 border-b border-slate-800 space-y-2">
        <h3 className="text-sm font-medium text-white">Шаблоны</h3>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск шаблонов..."
            className="h-7 pl-7 bg-[#1f2937] border-slate-700 text-xs"
            aria-label="Поиск шаблонов"
          />
        </div>

        <div className="flex flex-wrap gap-1">
          {CATEGORY_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant="ghost"
              size="sm"
              className={cn(
                'h-5 text-[10px] px-1.5',
                selectedCategory === opt.value
                  ? 'bg-violet-600/20 text-violet-300'
                  : 'text-slate-500 hover:text-white',
              )}
              onClick={() => setSelectedCategory(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1 px-3">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-slate-600">
            <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-xs">Шаблоны не найдены</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 py-3">
            {filtered.map((template) => (
              <button
                key={template.id}
                type="button"
                className="group relative bg-[#1f2937] rounded-lg overflow-hidden hover:ring-1 hover:ring-violet-500 transition-all text-left"
                onClick={() => onApplyTemplate(template)}
                aria-label={`Применить шаблон: ${template.title}`}
              >
                {template.thumbnail_url ? (
                  <img
                    src={template.thumbnail_url}
                    alt={template.title}
                    className="w-full aspect-[9/16] object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full aspect-[9/16] bg-gradient-to-br from-violet-600/20 to-indigo-600/20 flex items-center justify-center">
                    <Sparkles className="h-6 w-6 text-violet-500/50" />
                  </div>
                )}

                <div className="p-1.5">
                  <p className="text-[10px] text-white truncate">{template.title}</p>
                  <p className="text-[9px] text-slate-500">{template.use_count} использований</p>
                </div>

                {template.is_premium && (
                  <div className="absolute top-1 right-1 flex items-center gap-0.5 bg-amber-500/80 text-white text-[8px] px-1 rounded">
                    <Crown className="h-2.5 w-2.5" />
                    PRO
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
});
