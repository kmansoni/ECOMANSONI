import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

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
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide px-3 py-1.5">
      {filters.map((f) => (
        <button
          key={f.id}
          onClick={() => onFilterChange(f.id)}
          className={cn(
            "relative px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200",
            filter === f.id
              ? "text-white"
              : "text-white/50 hover:text-white/80"
          )}
          style={filter === f.id ? {
            background: "linear-gradient(135deg, rgba(0,180,216,0.25), rgba(0,200,150,0.2))",
            boxShadow: "0 2px 12px rgba(0,180,216,0.15)",
          } : {}}
        >
          {filter === f.id && (
            <motion.div
              layoutId="filter-pill"
              className="absolute inset-0 rounded-full"
              initial={false}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              style={{
                background: "linear-gradient(135deg, #0096c7, #00c896)",
                boxShadow: "0 4px 16px rgba(0,180,216,0.2)",
              }}
            />
          )}
          <span className="relative z-10">{f.label}</span>
        </button>
      ))}

      {filter !== 'all' && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => onFilterChange('all')}
          className="ml-auto p-1.5 rounded-full text-white/30 hover:text-white/60 transition-colors"
          aria-label="Сбросить фильтр"
        >
          <X className="w-4 h-4" />
        </motion.button>
      )}
    </div>
  );
}
