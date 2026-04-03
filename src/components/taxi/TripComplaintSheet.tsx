/**
 * TripComplaintSheet — шит для подачи жалобы на поездку такси.
 *
 * Паттерн: Uber/Bolt — категория жалобы, описание, фото, отправка.
 */

import { useState, useCallback, useRef } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle,
  Loader2,
  X,
  ShieldAlert,
  Route,
  DollarSign,
  Car,
  Clock,
  HelpCircle,
  UserX,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useTripComplaint, type ComplaintType } from '@/hooks/useTripComplaint';

// ─── Типы ────────────────────────────────────────────────────────────────────

interface TripComplaintSheetProps {
  open: boolean;
  onClose: () => void;
  rideId: string;
}

interface ComplaintCategory {
  type: ComplaintType;
  label: string;
  icon: React.ReactNode;
}

// ─── Категории жалоб ─────────────────────────────────────────────────────────

const COMPLAINT_CATEGORIES: ComplaintCategory[] = [
  { type: 'rude_driver', label: 'Грубый водитель', icon: <UserX className="w-5 h-5" /> },
  { type: 'unsafe_driving', label: 'Опасная езда', icon: <ShieldAlert className="w-5 h-5" /> },
  { type: 'wrong_route', label: 'Неправильный маршрут', icon: <Route className="w-5 h-5" /> },
  { type: 'overcharge', label: 'Завышение цены', icon: <DollarSign className="w-5 h-5" /> },
  { type: 'dirty_car', label: 'Грязная машина', icon: <Car className="w-5 h-5" /> },
  { type: 'no_show', label: 'Водитель не приехал', icon: <Clock className="w-5 h-5" /> },
  { type: 'other', label: 'Другое', icon: <HelpCircle className="w-5 h-5" /> },
];

const MAX_PHOTOS = 3;
const MAX_DESCRIPTION_LENGTH = 1000;

// ─── Компонент ───────────────────────────────────────────────────────────────

export function TripComplaintSheet({ open, onClose, rideId }: TripComplaintSheetProps) {
  const { submitComplaint, submitting, uploading } = useTripComplaint();

  const [selectedType, setSelectedType] = useState<ComplaintType | null>(null);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Обработчики ─────────────────────────────────────────────────────────

  const handlePhotoAdd = useCallback(() => {
    if (photos.length >= MAX_PHOTOS) return;
    fileInputRef.current?.click();
  }, [photos.length]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const available = MAX_PHOTOS - photos.length;
    const newFiles = files.slice(0, available);

    setPhotos((prev) => [...prev, ...newFiles]);

    for (const file of newFiles) {
      const url = URL.createObjectURL(file);
      setPreviews((prev) => [...prev, url]);
    }

    // Сбрасываем значение input, чтобы можно было выбрать тот же файл
    e.target.value = '';
  }, [photos.length]);

  const handlePhotoRemove = useCallback((index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => {
      const url = prev[index];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!selectedType) return;

    const success = await submitComplaint(rideId, selectedType, description, photos);
    if (success) {
      setSubmitted(true);
    }
  }, [selectedType, description, photos, rideId, submitComplaint]);

  const handleClose = useCallback(() => {
    // Очистка blob-URL при закрытии
    for (const url of previews) {
      URL.revokeObjectURL(url);
    }
    setSelectedType(null);
    setDescription('');
    setPhotos([]);
    setPreviews([]);
    setSubmitted(false);
    onClose();
  }, [onClose, previews]);

  const isProcessing = submitting || uploading;
  const canSubmit = selectedType !== null && !isProcessing;

  // ─── Экран подтверждения ──────────────────────────────────────────────────

  if (submitted) {
    return (
      <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
        <SheetContent side="bottom" className="bg-zinc-950 text-white border-zinc-800 pb-safe">
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold text-center">Жалоба отправлена</h3>
            <p className="text-sm text-zinc-400 text-center max-w-xs">
              Мы рассмотрим вашу жалобу в течение 24 часов. Результат будет отправлен в уведомлениях.
            </p>
            <Button
              onClick={handleClose}
              className="w-full max-w-xs bg-white/10 hover:bg-white/15 text-white mt-2"
            >
              Закрыть
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // ─── Основной экран ───────────────────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent
        side="bottom"
        className="bg-zinc-950 text-white border-zinc-800 p-0 max-h-[85vh] flex flex-col"
      >
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Жалоба на поездку
            </SheetTitle>
            <Button
              variant="ghost"
              size="icon"
              className="text-zinc-400 hover:text-white"
              onClick={handleClose}
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* Выбор категории */}
          <div>
            <p className="text-sm font-medium text-zinc-300 mb-3">Что произошло?</p>
            <div className="grid grid-cols-2 gap-2">
              {COMPLAINT_CATEGORIES.map((cat) => (
                <button
                  key={cat.type}
                  type="button"
                  onClick={() => setSelectedType(cat.type)}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-medium',
                    'border transition-all duration-150 min-h-[44px]',
                    'active:scale-[0.97]',
                    selectedType === cat.type
                      ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-600'
                  )}
                  aria-pressed={selectedType === cat.type}
                >
                  <span className={cn(
                    selectedType === cat.type ? 'text-amber-400' : 'text-zinc-500'
                  )}>
                    {cat.icon}
                  </span>
                  <span className="truncate">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Описание */}
          <div>
            <p className="text-sm font-medium text-zinc-300 mb-2">Опишите ситуацию</p>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
              placeholder="Расскажите подробнее о проблеме..."
              rows={4}
              className={cn(
                'bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600',
                'focus-visible:ring-amber-500/50 resize-none'
              )}
            />
            <p className="text-xs text-zinc-600 mt-1 text-right">
              {description.length}/{MAX_DESCRIPTION_LENGTH}
            </p>
          </div>

          {/* Фото */}
          <div>
            <p className="text-sm font-medium text-zinc-300 mb-2">
              Фото (необязательно, до {MAX_PHOTOS})
            </p>
            <div className="flex gap-2 flex-wrap">
              {previews.map((url, i) => (
                <div key={url} className="relative w-20 h-20 rounded-xl overflow-hidden group">
                  <img
                    src={url}
                    alt={`Фото ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handlePhotoRemove(i)}
                    className={cn(
                      'absolute top-1 right-1 w-6 h-6 rounded-full',
                      'bg-black/60 hover:bg-black/80 flex items-center justify-center',
                      'opacity-0 group-hover:opacity-100 transition-opacity'
                    )}
                    aria-label={`Удалить фото ${i + 1}`}
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}

              {photos.length < MAX_PHOTOS && (
                <button
                  type="button"
                  onClick={handlePhotoAdd}
                  className={cn(
                    'w-20 h-20 rounded-xl border-2 border-dashed border-zinc-700',
                    'flex flex-col items-center justify-center gap-1',
                    'text-zinc-500 hover:border-zinc-500 hover:text-zinc-400',
                    'transition-colors min-h-[44px]'
                  )}
                  aria-label="Добавить фото"
                >
                  <Camera className="w-5 h-5" />
                  <span className="text-[10px]">Фото</span>
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
              aria-hidden="true"
            />
          </div>
        </div>

        {/* Кнопка отправки */}
        <div className="px-4 pb-4 pt-3 border-t border-zinc-800 flex-shrink-0">
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              'w-full h-12 rounded-xl font-semibold text-sm',
              'bg-amber-600 hover:bg-amber-700 text-white',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'transition-all active:scale-[0.98]'
            )}
          >
            {isProcessing ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {uploading ? 'Загрузка фото...' : 'Отправка...'}
              </span>
            ) : (
              'Отправить жалобу'
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
