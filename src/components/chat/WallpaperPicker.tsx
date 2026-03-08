import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { CHAT_WALLPAPERS } from './chatWallpapers';
import { Check, ImagePlus } from 'lucide-react';

const WALLPAPER_LABELS: Record<string, string> = {
  default: 'По умолчанию',
  dark: 'Тёмный',
  'gradient-blue': 'Синий',
  'gradient-purple': 'Фиолетовый',
  'gradient-green': 'Зелёный',
  stars: 'Звёзды',
  geometric: 'Геометрия',
  'minimal-dark': 'Минимал тёмный',
  'minimal-light': 'Минимал светлый',
};

interface WallpaperPickerProps {
  selected: string;
  onChange: (wallpaper: string) => void;
  onCustomFileSelected?: (file: File) => Promise<void> | void;
  isUploading?: boolean;
}

function WallpaperThumb({ wallpaperKey, selected, onClick }: { wallpaperKey: string; selected: boolean; onClick: () => void }) {
  const classes = CHAT_WALLPAPERS[wallpaperKey] ?? '';
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative h-20 rounded-xl overflow-hidden border-2 transition-all',
        classes,
        selected ? 'border-primary' : 'border-transparent'
      )}
    >
      {selected ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-primary rounded-full p-0.5">
            <Check className="w-3 h-3 text-primary-foreground" />
          </div>
        </div>
      ) : null}
      <div className="absolute bottom-1 left-0 right-0 text-center">
        <span className="text-[10px] text-white/80 drop-shadow">{WALLPAPER_LABELS[wallpaperKey]}</span>
      </div>
    </button>
  );
}

export function WallpaperPicker({ selected, onChange, onCustomFileSelected, isUploading = false }: WallpaperPickerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preferred flow: persist custom image in backend storage.
    if (onCustomFileSelected) {
      await onCustomFileSelected(file);
      e.currentTarget.value = '';
      return;
    }

    // Fallback for legacy usage: temporary in-memory object URL.
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    onChange(url);
    e.currentTarget.value = '';
  };

  const isCustomSelected = !!selected && !(selected in CHAT_WALLPAPERS);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground px-1">Обои чата</p>
      <div className="grid grid-cols-3 gap-2">
        {Object.keys(CHAT_WALLPAPERS).map((key) => (
          <WallpaperThumb
            key={key}
            wallpaperKey={key}
            selected={selected === key}
            onClick={() => onChange(key)}
          />
        ))}
        <button
          disabled={isUploading}
          onClick={() => fileRef.current?.click()}
          className={cn(
            'h-20 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-colors',
            isCustomSelected ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary',
            isUploading && 'opacity-60 cursor-not-allowed'
          )}
        >
          <ImagePlus className="w-5 h-5 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">{isUploading ? 'Загрузка...' : 'Свой фон'}</span>
          {isCustomSelected ? <Check className="w-3 h-3 text-primary" /> : null}
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}
