import { useState } from 'react';
import { ArrowLeft, Home, Briefcase, Star, Bookmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SavedPlace } from '@/types/navigation';
import { savePlace } from '@/lib/navigation/places';

interface SavePlaceSheetProps {
  place: SavedPlace;
  userId: string;
  onClose: () => void;
  onSaved?: () => void;
}

const LABEL_OPTIONS: { id: 'home' | 'work' | 'custom'; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'home', label: 'Дом', icon: Home, color: 'text-blue-400' },
  { id: 'work', label: 'Работа', icon: Briefcase, color: 'text-purple-400' },
  { id: 'custom', label: 'Другое', icon: Star, color: 'text-yellow-400' },
];

export function SavePlaceSheet({ place, userId, onClose, onSaved }: SavePlaceSheetProps) {
  const [selectedLabel, setSelectedLabel] = useState<'home' | 'work' | 'custom'>('custom');
  const [customName, setCustomName] = useState(place.name);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePlace(userId, {
        label: selectedLabel,
        customName: selectedLabel === 'custom' ? customName : undefined,
        address: place.address,
        coordinates: place.coordinates,
        fiasId: place.fiasId,
        postalCode: place.postalCode,
        icon: selectedLabel === 'home' ? '🏠' : selectedLabel === 'work' ? '💼' : '⭐',
        category: place.category,
      });
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn(
      'absolute bottom-0 left-0 right-0 z-[960]',
      'bg-gray-950/95 backdrop-blur-xl',
      'rounded-t-2xl border-t border-white/10',
      'shadow-[0_-8px_40px_rgba(0,0,0,0.5)]',
      'pb-safe'
    )}>
      {/* Handle */}
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 rounded-full bg-white/20" />
      </div>

      <div className="px-4 pb-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <Bookmark className="w-5 h-5 text-blue-400" />
          <h3 className="text-white font-semibold">Сохранить место</h3>
        </div>

        {/* Address preview */}
        <div className="p-3 bg-gray-800/60 rounded-xl mb-4">
          <p className="text-sm text-white">{place.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">{place.address}</p>
          {place.fiasId && (
            <p className="text-[10px] text-gray-600 mt-1">ФИАС: {place.fiasId.substring(0, 8)}...</p>
          )}
        </div>

        {/* Label selection */}
        <p className="text-xs text-gray-400 mb-2">Тип</p>
        <div className="flex gap-2 mb-4">
          {LABEL_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                onClick={() => setSelectedLabel(opt.id)}
                className={cn(
                  'flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-colors',
                  selectedLabel === opt.id
                    ? 'bg-blue-500/15 border-blue-500/40'
                    : 'bg-gray-800/50 border-white/5 hover:bg-gray-700/50'
                )}
              >
                <Icon className={cn('w-5 h-5', opt.color)} />
                <span className="text-xs text-white font-medium">{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Custom name */}
        {selectedLabel === 'custom' && (
          <div className="mb-4">
            <label className="text-xs text-gray-400 mb-1 block">Название</label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Мое любимое место"
              className={cn(
                'w-full h-11 px-4 rounded-xl',
                'bg-gray-800/80 border border-white/10',
                'text-white placeholder:text-gray-500',
                'text-sm focus:outline-none focus:border-blue-500/50'
              )}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className={cn(
              'flex-1 h-11 rounded-xl',
              'bg-gray-800 border border-white/10',
              'text-gray-300 font-medium text-sm',
              'transition-all active:scale-[0.98]'
            )}
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (selectedLabel === 'custom' && !customName.trim())}
            className={cn(
              'flex-[2] h-11 rounded-xl font-bold text-sm',
              'transition-all active:scale-[0.98]',
              'flex items-center justify-center gap-2',
              !saving
                ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                : 'bg-gray-700 text-gray-500'
            )}
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              'Сохранить'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
