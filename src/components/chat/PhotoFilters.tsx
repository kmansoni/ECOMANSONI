import React, { useRef, useEffect } from 'react';
import { NamedFilter } from '../../hooks/useChatMediaEditor';

interface FilterDef {
  name: NamedFilter;
  label: string;
  style: string;
}

const FILTERS: FilterDef[] = [
  { name: 'original', label: 'Original', style: 'none' },
  { name: 'vivid',    label: 'Vivid',    style: 'saturate(1.5) contrast(1.1)' },
  { name: 'warm',     label: 'Warm',     style: 'sepia(0.3) saturate(1.2) brightness(1.1)' },
  { name: 'cool',     label: 'Cool',     style: 'hue-rotate(20deg) saturate(0.9)' },
  { name: 'bw',       label: 'B&W',      style: 'grayscale(1)' },
  { name: 'sepia',    label: 'Sepia',    style: 'sepia(0.8)' },
  { name: 'vintage',  label: 'Vintage',  style: 'sepia(0.4) contrast(0.9) brightness(1.1)' },
  { name: 'dramatic', label: 'Dramatic', style: 'contrast(1.5) brightness(0.9)' },
];

interface FilterPreviewProps {
  filter: FilterDef;
  imageUrl: string;
  isActive: boolean;
  onClick: () => void;
}

function FilterPreview({ filter, imageUrl, isActive, onClick }: FilterPreviewProps) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 flex-shrink-0">
      <div className={`w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${isActive ? 'border-blue-500 scale-105' : 'border-transparent'}`}>
        <img loading="lazy"
          src={imageUrl}
          alt={filter.label}
          className="w-full h-full object-cover"
          style={{ filter: filter.style }}
          draggable={false}
        />
      </div>
      <span className={`text-xs transition-colors ${isActive ? 'text-blue-400 font-medium' : 'text-white/70'}`}>
        {filter.label}
      </span>
    </button>
  );
}

interface PhotoFiltersProps {
  imageUrl: string;
  activeFilter: NamedFilter;
  onFilterSelect: (name: NamedFilter) => void;
}

export function PhotoFilters({ imageUrl, activeFilter, onFilterSelect }: PhotoFiltersProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    const activeIndex = FILTERS.findIndex((f) => f.name === activeFilter);
    if (activeIndex >= 0) {
      const itemWidth = 76;
      scrollRef.current.scrollTo({
        left: activeIndex * itemWidth - scrollRef.current.clientWidth / 2 + itemWidth / 2,
        behavior: 'smooth',
      });
    }
  }, [activeFilter]);

  return (
    <div
      ref={scrollRef}
      className="flex gap-3 px-4 py-2 overflow-x-auto"
      style={{ scrollbarWidth: 'none' }}
    >
      {FILTERS.map((filter) => (
        <FilterPreview
          key={filter.name}
          filter={filter}
          imageUrl={imageUrl}
          isActive={activeFilter === filter.name}
          onClick={() => onFilterSelect(filter.name)}
        />
      ))}
    </div>
  );
}

export default PhotoFilters;
