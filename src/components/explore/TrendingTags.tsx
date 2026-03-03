import React from 'react';
import { TrendingUp, TrendingDown, Hash } from 'lucide-react';
import type { TrendingHashtag } from '@/hooks/useExploreSearch';

interface TrendingTagsProps {
  tags: TrendingHashtag[];
  onSelect: (tag: string) => void;
}

export function TrendingTags({ tags, onSelect }: TrendingTagsProps) {
  if (tags.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-neutral-500 text-sm">
        Нет трендовых тегов
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 py-3">
        <span className="text-white font-semibold text-base">Популярное</span>
      </div>
      <ul>
        {tags.map((tag, idx) => (
          <li key={tag.id}>
            <button
              className="w-full flex items-center gap-3 px-4 py-3 active:bg-neutral-800 text-left"
              onClick={() => onSelect('#' + tag.tag)}
            >
              <span className="text-neutral-500 text-sm w-6 text-center font-medium">
                {idx + 1}
              </span>
              <div className="w-9 h-9 bg-neutral-800 rounded-full flex items-center justify-center shrink-0">
                <Hash size={18} className="text-neutral-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium">#{tag.tag}</p>
                <p className="text-neutral-500 text-xs">
                  {(tag.post_count || tag.recent_count || 0).toLocaleString('ru-RU')} публикаций
                </p>
              </div>
              {tag.growth_rate !== 0 && (
                <div className={`flex items-center gap-0.5 text-xs ${tag.growth_rate > 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {tag.growth_rate > 0
                    ? <TrendingUp size={14} />
                    : <TrendingDown size={14} />
                  }
                </div>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
