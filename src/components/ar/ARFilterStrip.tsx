import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { AR_FILTERS, AR_FILTER_CATEGORIES, type ARFilter } from '@/lib/ar/filters';

interface ARFilterStripProps {
  selectedFilter: ARFilter | null;
  onSelectFilter: (filter: ARFilter | null) => void;
}

export function ARFilterStrip({ selectedFilter, onSelectFilter }: ARFilterStripProps) {
  const [activeCategory, setActiveCategory] = React.useState<string>('all');
  const stripRef = useRef<HTMLDivElement>(null);

  const filters = activeCategory === 'all'
    ? AR_FILTERS
    : AR_FILTERS.filter(f => f.category === activeCategory);

  return (
    <div className="bg-black/60 backdrop-blur-sm pb-safe">
      {/* Category tabs */}
      <div className="flex gap-2 px-4 pt-3 pb-2 overflow-x-auto scrollbar-none">
        {AR_FILTER_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              activeCategory === cat.id
                ? 'bg-white text-black'
                : 'bg-white/20 text-white'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Filter strip */}
      <div
        ref={stripRef}
        className="flex gap-3 px-4 pb-3 overflow-x-auto scrollbar-none"
      >
        {/* No filter */}
        <button
          onClick={() => onSelectFilter(null)}
          className="flex-shrink-0 flex flex-col items-center gap-1"
        >
          <div className={`w-16 h-16 rounded-full border-2 bg-white/10 flex items-center justify-center text-xl transition-all ${
            selectedFilter === null ? 'border-white scale-110' : 'border-transparent'
          }`}>
            🚫
          </div>
          <span className="text-white text-[10px]">Без фильтра</span>
        </button>

        {filters.map(filter => (
          <motion.button
            key={filter.id}
            onClick={() => onSelectFilter(filter)}
            className="flex-shrink-0 flex flex-col items-center gap-1"
            whileTap={{ scale: 0.95 }}
          >
            <motion.div
              className={`w-16 h-16 rounded-full border-2 bg-white/10 flex items-center justify-center text-2xl transition-all ${
                selectedFilter?.id === filter.id
                  ? 'border-white scale-110 bg-white/30'
                  : 'border-transparent'
              }`}
              animate={selectedFilter?.id === filter.id ? { scale: 1.1 } : { scale: 1 }}
            >
              {filter.thumbnail}
            </motion.div>
            <span className="text-white text-[10px] text-center max-w-[64px] leading-tight">
              {filter.name}
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
