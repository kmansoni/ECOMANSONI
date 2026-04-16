/**
 * StickersPanel.tsx — Левая панель: стикеры.
 */

import React, { useState, useMemo } from 'react';
import { Search, Sticker } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { StickerPack, StickerItem } from '../../types';

interface StickersPanelProps {
  packs: StickerPack[];
  items: StickerItem[];
  onAddSticker: (sticker: StickerItem) => void;
}

export const StickersPanel = React.memo(function StickersPanel({
  packs,
  items,
  onAddSticker,
}: StickersPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    let result = items;
    if (selectedPackId) {
      result = result.filter((s) => s.pack_id === selectedPackId);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return result.sort((a, b) => a.sort_order - b.sort_order);
  }, [items, selectedPackId, searchQuery]);

  return (
    <div className="flex flex-col h-full" role="region" aria-label="Стикеры">
      <div className="p-3 border-b border-slate-800 space-y-2">
        <h3 className="text-sm font-medium text-white">Стикеры</h3>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск стикеров..."
            className="h-7 pl-7 bg-[#1f2937] border-slate-700 text-xs"
            aria-label="Поиск стикеров"
          />
        </div>

        {/* Pack selector */}
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={cn(
              'text-[10px] px-2 py-0.5 rounded',
              !selectedPackId ? 'bg-pink-600/20 text-pink-300' : 'text-slate-500 hover:text-white',
            )}
            onClick={() => setSelectedPackId(null)}
          >
            Все
          </button>
          {packs.map((pack) => (
            <button
              key={pack.id}
              type="button"
              className={cn(
                'text-[10px] px-2 py-0.5 rounded',
                selectedPackId === pack.id
                  ? 'bg-pink-600/20 text-pink-300'
                  : 'text-slate-500 hover:text-white',
              )}
              onClick={() => setSelectedPackId(pack.id)}
            >
              {pack.title}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1 px-3">
        {filteredItems.length === 0 ? (
          <div className="text-center py-8 text-slate-600">
            <Sticker className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-xs">Стикеры не найдены</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 py-3">
            {filteredItems.map((sticker) => (
              <button
                key={sticker.id}
                type="button"
                className="aspect-square bg-[#1f2937] rounded-lg p-2 hover:bg-slate-700 hover:ring-1 hover:ring-pink-500 transition-all cursor-pointer"
                onClick={() => onAddSticker(sticker)}
                aria-label={`Добавить стикер: ${sticker.name}`}
              >
                <img loading="lazy" src={sticker.thumbnail_url ?? sticker.file_url}
                  alt={sticker.name}
                  className="w-full h-full object-contain"
                  
                />
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
});
