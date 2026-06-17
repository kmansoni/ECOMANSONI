import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const TEXT_STORY_BACKGROUNDS = [
  { id: 'gradient-aurora', label: 'Аврора', className: 'from-slate-950 via-violet-700 to-cyan-500' },
  { id: 'sunset', label: 'Закат', className: 'from-red-950 via-orange-500 to-yellow-300' },
  { id: 'forest', label: 'Лес', className: 'from-emerald-950 via-green-600 to-lime-300' },
  { id: 'graphite', label: 'Графит', className: 'from-slate-950 via-slate-600 to-gray-900' },
] as const;

const TEXT_STORY_FONTS = [
  { id: 'classic', label: 'Classic', className: 'font-sans' },
  { id: 'serif', label: 'Serif', className: 'font-serif' },
  { id: 'mono', label: 'Mono', className: 'font-mono' },
] as const;

interface TextStoryEditorProps {
  text: string;
  onTextChange: (text: string) => void;
  backgroundId: string;
  onBackgroundChange: (id: string) => void;
  fontId: string;
  onFontChange: (id: string) => void;
  align: 'left' | 'center' | 'right';
  onAlignChange: (align: 'left' | 'center' | 'right') => void;
}

export function TextStoryEditor({
  text,
  onTextChange,
  backgroundId,
  onBackgroundChange,
  fontId,
  onFontChange,
  align,
  onAlignChange,
}: TextStoryEditorProps) {
  const background = TEXT_STORY_BACKGROUNDS.find((b) => b.id === backgroundId) ?? TEXT_STORY_BACKGROUNDS[0];
  const font = TEXT_STORY_FONTS.find((f) => f.id === fontId) ?? TEXT_STORY_FONTS[0];

  return (
    <>
      {/* Text input area */}
      <div className={cn('absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br px-6', background.className)}>
        <Textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          maxLength={280}
          placeholder="Напишите историю..."
          className={cn(
            'min-h-40 w-full max-w-xl resize-none border-0 bg-transparent text-4xl font-extrabold leading-tight text-white placeholder:text-white/55 shadow-none focus-visible:ring-0',
            font.className,
            align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center',
          )}
        />
        <div className="mt-5 text-xs font-medium text-white/65">{text.length}/280</div>
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-24 left-0 right-0 z-20 space-y-3 px-4">
        {/* Backgrounds */}
        <div className="flex justify-center gap-2">
          {TEXT_STORY_BACKGROUNDS.map((bg) => (
            <button
              key={bg.id}
              onClick={() => onBackgroundChange(bg.id)}
              className={cn(
                'h-9 w-9 rounded-full border-2 bg-gradient-to-br transition-transform active:scale-95',
                bg.className,
                backgroundId === bg.id ? 'border-white' : 'border-white/25',
              )}
              aria-label={`Фон: ${bg.label}`}
            />
          ))}
        </div>

        {/* Fonts and alignment */}
        <div className="mx-auto flex max-w-md items-center justify-center gap-2 rounded-2xl border border-white/15 bg-black/35 p-2 backdrop-blur-md">
          {TEXT_STORY_FONTS.map((f) => (
            <button
              key={f.id}
              onClick={() => onFontChange(f.id)}
              className={cn(
                'rounded-xl px-3 py-2 text-xs font-semibold transition-colors',
                f.className,
                fontId === f.id ? 'bg-white text-black' : 'text-white/75 hover:bg-white/10 hover:text-white',
              )}
            >
              {f.label}
            </button>
          ))}
          <button
            onClick={() => onAlignChange(align === 'center' ? 'left' : align === 'left' ? 'right' : 'center')}
            className="rounded-xl px-3 py-2 text-xs font-semibold text-white/75 transition-colors hover:bg-white/10 hover:text-white"
          >
            {align === 'left' ? 'Слева' : align === 'right' ? 'Справа' : 'Центр'}
          </button>
        </div>
      </div>
    </>
  );
}
