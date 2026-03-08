import {
  X, ArrowLeft, ChevronLeft, ChevronRight, Download, Search,
  Image, Film, FileText, Mic, Link, Play, HardDrive, ZoomIn, ZoomOut,
} from 'lucide-react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  useMediaGallery,
  MediaFilterType,
  MediaItem,
} from '@/hooks/useMediaGallery';

// ─── Типы фильтров ────────────────────────────────────────────────────────────
const FILTERS: { type: MediaFilterType; label: string; icon: React.ReactNode }[] = [
  { type: 'all', label: 'Все', icon: <HardDrive className="w-4 h-4" /> },
  { type: 'photos', label: 'Фото', icon: <Image className="w-4 h-4" /> },
  { type: 'videos', label: 'Видео', icon: <Film className="w-4 h-4" /> },
  { type: 'files', label: 'Файлы', icon: <FileText className="w-4 h-4" /> },
  { type: 'voice', label: 'Голосовые', icon: <Mic className="w-4 h-4" /> },
  { type: 'links', label: 'Ссылки', icon: <Link className="w-4 h-4" /> },
];

// ─── Форматирование ───────────────────────────────────────────────────────────
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ─── Полноэкранный просмотр ───────────────────────────────────────────────────
interface MediaViewerProps {
  items: MediaItem[];
  initialIndex: number;
  onClose: () => void;
  onDownload: (item: MediaItem) => void;
}

function MediaViewer({ items, initialIndex, onClose, onDownload }: MediaViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartX = useRef<number>(0);
  const imageRef = useRef<HTMLImageElement>(null);

  const current = items[currentIndex];

  const goTo = useCallback((idx: number) => {
    setCurrentIndex(idx);
    setScale(1);
    setContextMenuOpen(false);
  }, []);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) goTo(currentIndex - 1);
  }, [currentIndex, goTo]);

  const goNext = useCallback(() => {
    if (currentIndex < items.length - 1) goTo(currentIndex + 1);
  }, [currentIndex, items.length, goTo]);

  // Свайп ← → на тач-устройствах
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    longPressTimer.current = setTimeout(() => {
      setContextMenuOpen(true);
    }, 600);
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) {
      if (dx < 0) goNext(); else goPrev();
    }
  }, [goNext, goPrev]);

  // Клавиатурная навигация
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goPrev, goNext, onClose]);

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/70 backdrop-blur-sm">
        <button onClick={onClose} className="text-white p-1 rounded-full hover:bg-white/10">
          <X className="w-6 h-6" />
        </button>
        <span className="text-white/80 text-sm font-medium">
          {currentIndex + 1} из {items.length}
        </span>
        <button
          onClick={() => onDownload(current)}
          className="text-white p-1 rounded-full hover:bg-white/10"
          aria-label="Скачать"
        >
          <Download className="w-6 h-6" />
        </button>
      </div>

      {/* Media area */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {(current.type === 'image') && (
          <img
            ref={imageRef}
            src={current.url}
            alt={current.filename ?? 'медиа'}
            className="max-h-full max-w-full object-contain select-none transition-transform duration-200"
            style={{ transform: `scale(${scale})` }}
            draggable={false}
          />
        )}
        {current.type === 'video' && (
          <video
            src={current.url}
            controls
            className="max-h-full max-w-full"
            autoPlay
          />
        )}
        {(current.type === 'file' || current.type === 'voice' || current.type === 'link') && (
          <div className="flex flex-col items-center gap-4 text-white text-center px-6">
            <FileText className="w-16 h-16 text-white/50" />
            <p className="text-lg break-all">{current.filename ?? current.url}</p>
            {current.filesize && (
              <p className="text-sm text-white/60">{formatFileSize(current.filesize)}</p>
            )}
          </div>
        )}

        {/* Стрелки навигации (не мобильные) */}
        {currentIndex > 0 && (
          <button
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 hidden sm:flex"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        {currentIndex < items.length - 1 && (
          <button
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 hidden sm:flex"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Zoom controls для фото */}
      {current.type === 'image' && (
        <div className="flex justify-center gap-4 py-3 bg-black/70 backdrop-blur-sm">
          <button
            onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
            className="text-white/70 hover:text-white"
            aria-label="Уменьшить"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <span className="text-white/70 text-sm self-center min-w-[3rem] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(4, s + 0.25))}
            className="text-white/70 hover:text-white"
            aria-label="Увеличить"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Context menu (длинное нажатие) */}
      {contextMenuOpen && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-zinc-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl min-w-[200px] z-10">
          <button
            onClick={() => { onDownload(current); setContextMenuOpen(false); }}
            className="flex items-center gap-3 w-full px-5 py-3.5 text-white hover:bg-white/10 text-sm"
          >
            <Download className="w-4 h-4" />
            Скачать
          </button>
          <button
            onClick={() => setContextMenuOpen(false)}
            className="flex items-center gap-3 w-full px-5 py-3.5 text-red-400 hover:bg-white/10 text-sm border-t border-white/10"
          >
            <X className="w-4 h-4" />
            Закрыть
          </button>
        </div>
      )}

      {/* Закрыть контекстное меню по клику вне */}
      {contextMenuOpen && (
        <div
          className="absolute inset-0"
          onClick={() => setContextMenuOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Основной компонент ───────────────────────────────────────────────────────
interface MediaGalleryEnhancedProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  title?: string;
}

export function MediaGalleryEnhanced({
  isOpen,
  onClose,
  conversationId,
  title = 'Медиафайлы',
}: MediaGalleryEnhancedProps) {
  const {
    filteredMedia,
    filterType,
    setFilterType,
    fileSearch,
    setFileSearch,
    groupedByMonth,
    currentIndex,
    openViewer,
    closeViewer,
    navigateViewer: _nav,
    downloadMedia,
    isLoading,
    hasMore,
    loadMore,
  } = useMediaGallery(conversationId);

  const [showSearch, setShowSearch] = useState(false);

  // Ленивая подгрузка при скролле
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!bottomRef.current || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { threshold: 0.5 }
    );
    obs.observe(bottomRef.current);
    return () => obs.disconnect();
  }, [hasMore, loadMore]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
        {/* Шапка */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-zinc-900">
          <button onClick={onClose} className="text-white/70 hover:text-white p-1">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="flex-1 text-white font-semibold text-lg truncate">{title}</h2>
          <button
            onClick={() => setShowSearch((v) => !v)}
            className={cn(
              'text-white/70 hover:text-white p-1 rounded-full transition-colors',
              showSearch && 'text-white bg-white/10'
            )}
          >
            <Search className="w-5 h-5" />
          </button>
        </div>

        {/* Поиск по файлам */}
        {showSearch && (
          <div className="px-4 py-2 bg-zinc-900 border-b border-white/10">
            <input
              type="search"
              value={fileSearch}
              onChange={(e) => setFileSearch(e.target.value)}
              placeholder="Поиск по имени файла..."
              className="w-full bg-zinc-800 text-white placeholder-white/40 rounded-xl px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          </div>
        )}

        {/* Фильтры */}
        <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide border-b border-white/10 bg-zinc-900">
          {FILTERS.map((f) => (
            <button
              key={f.type}
              onClick={() => setFilterType(f.type)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all',
                filterType === f.type
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-white/60 hover:bg-zinc-700 hover:text-white'
              )}
            >
              {f.icon}
              {f.label}
            </button>
          ))}
        </div>

        {/* Контент */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && groupedByMonth.length === 0 && (
            <div className="flex items-center justify-center h-40 text-white/40 text-sm">
              Загрузка...
            </div>
          )}

          {!isLoading && groupedByMonth.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-white/40">
              <HardDrive className="w-10 h-10 opacity-30" />
              <p className="text-sm">Ничего не найдено</p>
            </div>
          )}

          {groupedByMonth.map(({ month, items }) => (
            <div key={month}>
              {/* Заголовок месяца */}
              <div className="sticky top-0 z-10 px-4 py-2 bg-zinc-950/90 backdrop-blur-sm">
                <span className="text-xs font-medium text-white/40 uppercase tracking-wide">
                  {month}
                </span>
              </div>

              {/* Сетка медиа */}
              {(filterType === 'all' || filterType === 'photos' || filterType === 'videos') ? (
                <div className="grid grid-cols-3 gap-0.5 px-0.5">
                  {items.map((item, idx) => {
                    const globalIdx = filteredMedia.indexOf(item);
                    return (
                      <button
                        key={item.id}
                        onClick={() => openViewer(globalIdx)}
                        className="relative aspect-square bg-zinc-800 overflow-hidden group"
                      >
                        {item.type === 'image' && (
                          <img
                            src={item.url}
                            alt={item.filename ?? ''}
                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                            loading="lazy"
                          />
                        )}
                        {item.type === 'video' && (
                          <>
                            <video
                              src={item.url}
                              muted
                              playsInline
                              preload="metadata"
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Play className="w-8 h-8 text-white drop-shadow-lg" fill="white" />
                            </div>
                          </>
                        )}
                        {/* Индикатор: загружен ли файл в кэш */}
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-xs">📥</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                // Список для файлов, голосовых, ссылок
                <div className="divide-y divide-white/5">
                  {items.map((item) => {
                    const globalIdx = filteredMedia.indexOf(item);
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          if (item.type === 'link') {
                            window.open(item.url, '_blank', 'noopener,noreferrer');
                          } else {
                            openViewer(globalIdx);
                          }
                        }}
                        className="flex items-center gap-3 w-full px-4 py-3 hover:bg-white/5 text-left"
                      >
                        {/* Иконка типа */}
                        <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0">
                          {item.type === 'file' && <FileText className="w-5 h-5 text-blue-400" />}
                          {item.type === 'voice' && <Mic className="w-5 h-5 text-green-400" />}
                          {item.type === 'link' && <Link className="w-5 h-5 text-purple-400" />}
                        </div>

                        {/* Инфо */}
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm truncate">
                            {item.filename ?? item.link_title ?? item.url}
                          </p>
                          <p className="text-white/40 text-xs mt-0.5">
                            {item.filesize
                              ? formatFileSize(item.filesize)
                              : item.duration
                              ? formatDuration(item.duration)
                              : format(new Date(item.created_at), 'd MMM yyyy', { locale: ru })}
                            {item.sender_name && ` · ${item.sender_name}`}
                          </p>
                        </div>

                        {/* Скачать */}
                        {item.type !== 'link' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadMedia(item);
                            }}
                            className="text-white/40 hover:text-white p-1"
                            aria-label="Скачать"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          {/* Sentinel для infinite scroll */}
          <div ref={bottomRef} className="h-8" />

          {isLoading && groupedByMonth.length > 0 && (
            <div className="flex justify-center py-4 text-white/30 text-xs">
              Загрузка...
            </div>
          )}
        </div>
      </div>

      {/* Полноэкранный просмотр */}
      {currentIndex !== -1 && (
        <MediaViewer
          items={filteredMedia.filter((i) => i.type === 'image' || i.type === 'video')}
          initialIndex={
            filteredMedia
              .filter((i) => i.type === 'image' || i.type === 'video')
              .findIndex((i) => i === filteredMedia[currentIndex])
          }
          onClose={closeViewer}
          onDownload={downloadMedia}
        />
      )}
    </>
  );
}
