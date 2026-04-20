import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { TravelMode } from '@/types/navigation';

interface TravelModeToggleProps {
  value: TravelMode;
  onChange: (mode: TravelMode) => void;
  className?: string;
}

const MODES: Array<{ id: TravelMode; emoji: string; label: string }> = [
  { id: 'car', emoji: '🚗', label: 'Авто' },
  { id: 'taxi', emoji: '🚕', label: 'Такси' },
  { id: 'pedestrian', emoji: '🚶', label: 'Пешком' },
  { id: 'transit', emoji: '🚌', label: 'Транзит' },
  { id: 'metro', emoji: '🚇', label: 'Метро' },
  { id: 'multimodal', emoji: '🔀', label: 'Мульти' },
];

export const TravelModeToggle = memo(function TravelModeToggle({
  value,
  onChange,
  className,
}: TravelModeToggleProps) {
  return (
    <div
      className={cn(
      'flex items-center gap-0.5 p-0.5 rounded-xl flex-wrap',
        'bg-gray-900/80 backdrop-blur-md border border-white/10',
        'shadow-lg shadow-black/30',
        className
      )}
    >
      {MODES.map(mode => (
        <button
          key={mode.id}
          onClick={() => onChange(mode.id)}
          className={cn(
            'min-w-9 h-9 px-2 rounded-lg flex items-center justify-center gap-1',
            'transition-all text-base',
            value === mode.id
              ? 'bg-blue-500/30 shadow-inner'
              : 'hover:bg-white/5'
          )}
          aria-label={mode.label}
          title={mode.label}
        >
          <span>{mode.emoji}</span>
          <span className="text-[10px] text-gray-200 hidden xl:inline">{mode.label}</span>
        </button>
      ))}
    </div>
  );
});
