import { Input } from '@/components/ui/input';
import { Image, Upload } from 'lucide-react';

interface LiveStreamSetupProps {
  title: string;
  onTitleChange: (title: string) => void;
  category: string;
  onCategoryChange: (category: string) => void;
  onOpenCoverPicker: () => void;
}

const CATEGORIES = [
  { value: 'other', label: 'Другое' },
  { value: 'music', label: 'Музыка' },
  { value: 'gaming', label: 'Игры' },
  { value: 'chat', label: 'Разговор' },
  { value: 'performance', label: 'Перформанс' },
];

export function LiveStreamSetup({
  title,
  onTitleChange,
  category,
  onCategoryChange,
  onOpenCoverPicker,
}: LiveStreamSetupProps) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-8">
      {/* Cover picker */}
      <div
        onClick={onOpenCoverPicker}
        className="w-40 h-40 rounded-full border-2 border-dashed border-white/30 flex flex-col items-center justify-center cursor-pointer hover:border-white/60 transition-colors"
      >
        <Image className="w-10 h-10 text-white/40 mb-2" />
        <span className="text-xs text-white/40">Обложка</span>
      </div>

      {/* Title input */}
      <Input
        placeholder="Название трансляции..."
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        maxLength={50}
        className="bg-white/10 border-white/20 text-white placeholder:text-white/40 text-center text-lg h-12 rounded-2xl"
      />

      {/* Category select */}
      <select
        value={category}
        onChange={(e) => onCategoryChange(e.target.value)}
        className="w-full bg-white/10 border border-white/20 text-white rounded-2xl px-4 py-3 text-sm appearance-none"
      >
        {CATEGORIES.map((cat) => (
          <option key={cat.value} value={cat.value} className="bg-black">
            {cat.label}
          </option>
        ))}
      </select>
    </div>
  );
}
