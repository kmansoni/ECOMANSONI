import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ContentFilter = 'all' | 'media' | 'text';

interface FeedFiltersProps {
  filter: ContentFilter;
  onFilterChange: (filter: ContentFilter) => void;
}

const filters: { id: ContentFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'media', label: 'Публикации' },
  { id: 'text', label: 'Текст' },
];

export function FeedFilters({ filter, onFilterChange }: FeedFiltersProps) {
  return (
    <div className="flex items-center gap-4 overflow-x-auto scrollbar-hide border-y border-white/15 bg-white/10 px-4 py-2 backdrop-blur-2xl">
      {filters.map((f) => (
        <button
          key={f.id}
          onClick={() => onFilterChange(f.id)}
          className={cn(
            "relative py-1 text-sm font-medium whitespace-nowrap transition-all duration-200",
            filter === f.id
              ? "text-foreground/70"
              : "text-foreground/40 hover:text-foreground/55"
          )}
        >
          {f.label}
        </button>
      ))}
      
      {filter !== 'all' && (
        <button
          onClick={() => onFilterChange('all')}
          className="p-1.5 rounded-full text-foreground/30 hover:text-foreground/50 transition-colors ml-auto"
          aria-label="Сбросить фильтр"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
