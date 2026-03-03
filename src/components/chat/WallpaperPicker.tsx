import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { WALLPAPERS } from './ChatBackground';
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
}

function WallpaperThumb({ wallpaperKey, selected, onClick }: { wallpaperKey: string; selected: boolean; onClick: () => void }) {
  const classes = WALLPAPERS[wallpaperKey] ?? '';
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

export function WallpaperPicker({ selected, onChange }: WallpaperPickerProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    onChange(url);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground px-1">Обои чата</p>
      <div className="grid grid-cols-3 gap-2">
        {Object.keys(WALLPAPERS).map((key) => (
          <WallpaperThumb
            key={key}
            wallpaperKey={key}
            selected={selected === key}
            onClick={() => onChange(key)}
          />
        ))}
        <button
          onClick={() => fileRef.current?.click()}
          className="h-20 rounded-xl border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 hover:border-primary transition-colors"
        >
          <ImagePlus className="w-5 h-5 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">Свой фон</span>
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}
