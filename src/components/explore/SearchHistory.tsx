import React from 'react';
import { X, Clock, Hash, User, MapPin } from 'lucide-react';
import type { SearchHistoryItem } from '@/hooks/useExploreSearch';

interface SearchHistoryProps {
  history: SearchHistoryItem[];
  onSelect: (query: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

const typeIcon = (type: string) => {
  switch (type) {
    case 'user': return <User size={16} className="text-neutral-400" />;
    case 'hashtag': return <Hash size={16} className="text-neutral-400" />;
    case 'location': return <MapPin size={16} className="text-neutral-400" />;
    default: return <Clock size={16} className="text-neutral-400" />;
  }
};

export function SearchHistory({ history, onSelect, onDelete, onClearAll }: SearchHistoryProps) {
  if (history.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-neutral-500 text-sm">
        История поиска пуста
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-white font-semibold text-base">Недавние</span>
        <button
          onClick={onClearAll}
          className="text-blue-400 text-sm font-medium active:opacity-70"
        >
          Очистить всё
        </button>
      </div>
      <ul>
        {history.map(item => (
          <li
            key={item.id}
            className="flex items-center gap-3 px-4 py-2.5 active:bg-neutral-800"
          >
            <div className="w-8 h-8 bg-neutral-800 rounded-full flex items-center justify-center shrink-0">
              {typeIcon(item.type)}
            </div>
            <button
              className="flex-1 text-left text-white text-sm truncate"
              onClick={() => onSelect(item.query)}
            >
              {item.query}
            </button>
            <button
              onClick={() => onDelete(item.id)}
              className="text-neutral-500 p-1 active:opacity-70"
            >
              <X size={16} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
