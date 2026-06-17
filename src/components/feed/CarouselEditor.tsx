import { useState, useRef, useMemo, type CSSProperties } from 'react';
import { Plus, Trash2, GripVertical, Film, ImageIcon, ChevronUp, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { CarouselSlide } from './editorStateModel';
import { createCarouselSlide } from './editorStateModel';
import { FILTERS } from '@/components/editor/photoFiltersModel';
import { adjustmentsToFilterStyle } from './editorStateModel';

interface CarouselEditorProps {
  slides: CarouselSlide[];
  selectedSlideId: string | null;
  onSelectSlide: (id: string) => void;
  onAddSlide: (slide: CarouselSlide) => void;
  onRemoveSlide: (id: string) => void;
  onReorderSlide: (fromIndex: number, toIndex: number) => void;
  onUpdateSlide: (id: string, updates: Partial<CarouselSlide>) => void;
}

export function CarouselEditor({
  slides,
  selectedSlideId,
  onSelectSlide,
  onAddSlide,
  onRemoveSlide,
  onReorderSlide,
  onUpdateSlide,
}: CarouselEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [touchDrag, setTouchDrag] = useState<{ index: number; startY: number; currentIndex: number } | null>(null);

  const selectedSlide = slides.find((s) => s.id === selectedSlideId) ?? slides[0] ?? null;
  const selectedIdx = slides.indexOf(selectedSlide!);
  const filterIdMap = useMemo(() => new Map(FILTERS.map((f, i) => [f.id, i])), []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const remaining = 20 - slides.length;
    if (remaining <= 0) {
      toast.error('Максимум 20 слайдов в карусели');
      return;
    }

    const toProcess = files.slice(0, remaining);
    if (files.length > remaining) {
      toast.warning(`Добавлено только ${remaining} из ${files.length} файлов (лимит 20)`);
    }

    for (const file of toProcess) {
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`Файл "${file.name}" превышает 50 МБ`);
        continue;
      }
      const url = URL.createObjectURL(file);
      const slide = createCarouselSlide(file, url);
      onAddSlide(slide);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const moveSlide = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= slides.length) return;
    onReorderSlide(index, target);
  };

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== toIndex) {
      onReorderSlide(dragIndex, toIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // Touch DnD — pointer-based для мобильных устройств
  const TOUCH_THRESHOLD = 10; // px до начала перетаскивания

  const handleTouchStart = (e: React.TouchEvent, index: number) => {
    const touch = e.touches[0];
    setTouchDrag({ index, startY: touch.clientY, currentIndex: index });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchDrag) return;
    const touch = e.touches[0];
    const deltaY = Math.abs(touch.clientY - touchDrag.startY);
    if (deltaY < TOUCH_THRESHOLD) return; // не начали drag ещё

    // Начинаем drag
    if (dragIndex === null) {
      setDragIndex(touchDrag.index);
    }

    // Находим текущую позицию среди visible слайдов
    const el = e.currentTarget as HTMLElement;
    const grid = el.closest('.grid');
    if (!grid) return;
    const slideEls = Array.from(grid.querySelectorAll('[data-slide-index]'));
    let currentIdx = touchDrag.index;
    for (const slideEl of slideEls) {
      const rect = slideEl.getBoundingClientRect();
      if (touch.clientY < rect.bottom && touch.clientY > rect.top) {
        const idx = parseInt((slideEl as HTMLElement).dataset.slideIndex ?? '0', 10);
        currentIdx = idx;
      }
    }
    setDragOverIndex(currentIdx);
  };

  const handleTouchEnd = () => {
    if (touchDrag && dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      onReorderSlide(dragIndex, dragOverIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
    setTouchDrag(null);
  };

  const selectedFilter = selectedSlide ? FILTERS[selectedSlide.filterIdx] ?? FILTERS[0] : FILTERS[0];
  const adjStyle = selectedSlide ? adjustmentsToFilterStyle(selectedSlide.adjustments) : {};
  const filterCSS = selectedSlide && selectedSlide.filterIdx > 0 && selectedFilter.style.filter
    ? String(selectedFilter.style.filter)
    : '';
  const combinedFilter = [filterCSS, adjStyle.filter].filter(Boolean).join(' ');

  return (
    <div className="space-y-4">
      {/* Slide grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {slides.map((slide, index) => (
          <div
            key={slide.id}
            data-slide-index={index}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            onTouchStart={(e) => handleTouchStart(e, index)}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={() => onSelectSlide(slide.id)}
            className={cn(
              'relative aspect-square rounded-lg overflow-hidden cursor-pointer group border-2 transition-all',
              slide.id === selectedSlideId
                ? 'border-blue-500 ring-2 ring-blue-500/30'
                : 'border-transparent hover:border-white/30',
              dragIndex === index ? 'opacity-50 scale-95' : '',
              dragOverIndex === index ? 'border-white/60' : '',
            )}
          >
            {/* Insertion line indicator */}
            {dragOverIndex === index && dragIndex !== null && dragIndex !== index && (
              <div
                className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 z-10 rounded-full animate-pulse"
                style={{ left: '-3px' }}
              />
            )}
            {slide.mediaType === 'video' ? (
              <video src={slide.previewUrl} className="w-full h-full object-cover" muted />
            ) : (
              <img
                src={slide.previewUrl}
                alt={`Slide ${index + 1}`}
                className="w-full h-full object-cover"
                style={slide.id === selectedSlideId ? { filter: combinedFilter || undefined } : undefined}
              />
            )}

            {/* Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="absolute top-1 left-1 flex items-center gap-1">
                <GripVertical className="w-3 h-3 text-white/80" />
                <span className="text-[10px] font-bold text-white">{index + 1}</span>
              </div>
              <div className="absolute bottom-1 right-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 bg-black/50 hover:bg-red-600 text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveSlide(slide.id);
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>

            {/* Video indicator */}
            {slide.mediaType === 'video' && (
              <div className="absolute top-1 right-1 bg-black/60 rounded p-0.5">
                <Film className="w-3 h-3 text-white" />
              </div>
            )}

            {/* Selected indicator */}
            {slide.id === selectedSlideId && (
              <div className="absolute inset-0 border-2 border-blue-500 rounded-lg pointer-events-none" />
            )}
          </div>
        ))}

        {/* Add slide button */}
        {slides.length < 20 && (
          <div className="aspect-square rounded-lg border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-1 hover:border-white/50 hover:bg-white/5 cursor-pointer transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10"
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus className="w-5 h-5" />
            </Button>
            <span className="text-[10px] text-white/50">Добавить</span>
          </div>
        )}
      </div>

      {/* Selected slide editor */}
      {selectedSlide && (
        <div className="space-y-3 rounded-lg border border-white/10 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/70 uppercase tracking-wide">
              Слайд {selectedIdx + 1} из {slides.length}
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white/60 hover:text-white"
                onClick={() => moveSlide(selectedIdx, -1)}
                disabled={selectedIdx === 0}
              >
                <ChevronUp className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white/60 hover:text-white"
                onClick={() => moveSlide(selectedIdx, 1)}
                disabled={selectedIdx === slides.length - 1}
              >
                <ChevronDown className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white/60 hover:text-white"
                onClick={() => {
                  onRemoveSlide(selectedSlide.id);
                  toast.success('Слайд удалён');
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Caption */}
          <div className="space-y-1">
            <label className="text-xs text-white/60">Подпись к слайду</label>
            <Textarea
              value={selectedSlide.caption}
              onChange={(e) => onUpdateSlide(selectedSlide.id, { caption: e.target.value })}
              placeholder="Добавить подпись..."
              maxLength={2200}
              rows={2}
              className="text-sm"
            />
            <p className="text-right text-[10px] text-white/40">{selectedSlide.caption.length}/2200</p>
          </div>

          {/* Filter */}
          <div className="space-y-1">
            <label className="text-xs text-white/60">Фильтр</label>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {FILTERS.slice(0, 10).map((filter) => {
                  const filterIdx = filterIdMap.get(filter.id) ?? 0;
                  return (
                <button
                  key={filter.id}
                  onClick={() => onUpdateSlide(selectedSlide.id, { filterIdx })}
                  className={cn(
                    'flex-shrink-0 w-12 h-12 rounded-lg border-2 transition-all',
                    selectedSlide.filterIdx === filterIdx
                      ? 'border-blue-500 scale-105'
                      : 'border-transparent hover:border-white/30',
                  )}
                  style={{
                    background: filter.style.filter
                      ? undefined
                      : `linear-gradient(135deg, #666 0%, #999 100%)`,
                  }}
                >
                  {filter.style.filter && (
                    <div className="w-full h-full rounded-md" style={filter.style} />
                  )}
                  {filter.style.filter && filter.overlay && (
                    <div
                      className="absolute inset-0 rounded-md pointer-events-none"
                      style={{
                        backgroundColor: filter.overlay.color,
                        mixBlendMode: filter.overlay.blendMode as CSSProperties['mixBlendMode'],
                        opacity: filter.overlay.opacity * selectedSlide.filterIntensity,
                      }}
                    />
                  )}
                </button>
              );
            })}
            </div>
          </div>
        </div>
      )}

      {slides.length === 0 && (
        <div className="text-center py-8 text-white/50 text-sm">
          <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p>Добавьте минимум 2 слайда для создания карусели</p>
        </div>
      )}
    </div>
  );
}
