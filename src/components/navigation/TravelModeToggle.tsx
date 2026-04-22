import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { TravelMode } from '@/types/navigation';
import { useUserSettings } from '@/contexts/UserSettingsContext';
import { navText } from '@/lib/navigation/navigationUi';

interface TravelModeToggleProps {
  value: TravelMode;
  onChange: (mode: TravelMode) => void;
  className?: string;
}

export const TravelModeToggle = memo(function TravelModeToggle({
  value,
  onChange,
  className,
}: TravelModeToggleProps) {
  const { settings } = useUserSettings();
  const languageCode = settings?.language_code ?? null;
  const modes: Array<{ id: TravelMode; emoji: string; label: string }> = [
    { id: 'car', emoji: '🚗', label: navText('Авто', 'Car', languageCode) },
    { id: 'taxi', emoji: '🚕', label: navText('Такси', 'Taxi', languageCode) },
    { id: 'pedestrian', emoji: '🚶', label: navText('Пешком', 'Walk', languageCode) },
    { id: 'transit', emoji: '🚌', label: navText('Транзит', 'Transit', languageCode) },
    { id: 'metro', emoji: '🚇', label: navText('Метро', 'Metro', languageCode) },
    { id: 'multimodal', emoji: '🔀', label: navText('Мульти', 'Multi', languageCode) },
  ];

  return (
    <div
      className={cn(
      'flex items-center gap-0.5 p-0.5 rounded-xl flex-wrap',
        'bg-gray-900/80 backdrop-blur-md border border-white/10',
        'shadow-lg shadow-black/30',
        className
      )}
    >
      {modes.map(mode => (
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
