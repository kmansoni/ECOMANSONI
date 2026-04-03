import { useState, useCallback } from 'react';
import {
  Bookmark, Bell, BellOff, Mail, MailMinus,
  Trash2, Search, Loader2, SlidersHorizontal, Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useSavedSearches, type PropertyFilters } from '@/hooks/useSavedSearches';
import { cn } from '@/lib/utils';

function SavedSearchesSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="p-3 rounded-lg border border-border space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatFilters(filters: PropertyFilters): string {
  const parts: string[] = [];

  const dealTypeLabels: Record<string, string> = {
    buy: 'Купить', rent: 'Снять', sale: 'Купить', daily: 'Посуточно',
  };
  if (filters.dealType) parts.push(dealTypeLabels[filters.dealType] ?? filters.dealType);

  const typeLabels: Record<string, string> = {
    apartment: 'Квартира', house: 'Дом', room: 'Комната',
    commercial: 'Коммерция', land: 'Участок',
  };
  if (filters.propertyType) parts.push(typeLabels[filters.propertyType] ?? filters.propertyType);

  if (filters.rooms?.length) {
    parts.push(`${filters.rooms.join(', ')} комн.`);
  }

  if (filters.minPrice || filters.maxPrice) {
    const min = filters.minPrice ? `от ${formatPriceShort(filters.minPrice)}` : '';
    const max = filters.maxPrice ? `до ${formatPriceShort(filters.maxPrice)}` : '';
    parts.push([min, max].filter(Boolean).join(' '));
  }

  if (filters.district) parts.push(filters.district);
  if (filters.city) parts.push(filters.city);

  return parts.length > 0 ? parts.join(' · ') : 'Все объекты';
}

function formatPriceShort(price: number): string {
  if (price >= 1_000_000) return `${(price / 1_000_000).toFixed(1)} млн`;
  if (price >= 1_000) return `${Math.round(price / 1_000)} тыс`;
  return String(price);
}

interface SavedSearchesProps {
  onApplyFilters?: (filters: PropertyFilters) => void;
  currentFilters?: PropertyFilters;
}

export function SavedSearches({ onApplyFilters, currentFilters }: SavedSearchesProps) {
  const {
    savedSearches,
    isLoading,
    saveSearch,
    isSaving,
    deleteSearch,
    isDeleting,
    toggleNotify,
  } = useSavedSearches();

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    if (!searchName.trim() || !currentFilters) return;

    try {
      await saveSearch(searchName.trim(), currentFilters);
      setShowSaveDialog(false);
      setSearchName('');
    } catch {
      // toast уже показан в хуке
    }
  }, [searchName, currentFilters, saveSearch]);

  const handleDelete = useCallback((id: string) => {
    deleteSearch(id);
    setDeleteConfirmId(null);
  }, [deleteSearch]);

  if (isLoading) return <SavedSearchesSkeleton />;

  return (
    <div className="flex flex-col">
      {/* Заголовок */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Bookmark className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-base font-semibold text-foreground">Сохранённые поиски</h2>
        </div>
        {currentFilters && (
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowSaveDialog(true)}
            className="min-h-[44px]"
            aria-label="Сохранить текущий поиск"
          >
            <Bookmark className="w-4 h-4 mr-1.5" />
            Сохранить
          </Button>
        )}
      </div>

      {/* Пустое состояние */}
      {savedSearches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <SlidersHorizontal className="w-12 h-12 text-muted-foreground mb-4" aria-hidden="true" />
          <h3 className="text-lg font-semibold text-foreground mb-1">Нет сохранённых поисков</h3>
          <p className="text-sm text-muted-foreground max-w-[280px]">
            Настройте фильтры и сохраните поиск, чтобы получать уведомления о новых объявлениях
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {savedSearches.map(search => (
            <div
              key={search.id}
              className="px-4 py-3 space-y-2"
            >
              {/* Название и действия */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-foreground truncate">{search.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {formatFilters(search.filters)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 min-h-[44px] min-w-[44px] text-destructive hover:text-destructive"
                  onClick={() => setDeleteConfirmId(search.id)}
                  disabled={isDeleting}
                  aria-label={`Удалить поиск "${search.name}"`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              {/* Кнопки уведомлений и применить */}
              <div className="flex items-center gap-3 flex-wrap">
                <label
                  className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer min-h-[44px]"
                  aria-label="Push-уведомления"
                >
                  {search.notify_push ? (
                    <Bell className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                  ) : (
                    <BellOff className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <Switch
                    checked={search.notify_push}
                    onCheckedChange={v => toggleNotify(search.id, 'notify_push', v)}
                    aria-label="Push-уведомления"
                  />
                  <span>Push</span>
                </label>

                <label
                  className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer min-h-[44px]"
                  aria-label="Email-уведомления"
                >
                  {search.notify_email ? (
                    <Mail className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                  ) : (
                    <MailMinus className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <Switch
                    checked={search.notify_email}
                    onCheckedChange={v => toggleNotify(search.id, 'notify_email', v)}
                    aria-label="Email-уведомления"
                  />
                  <span>Email</span>
                </label>

                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto min-h-[44px]"
                  onClick={() => onApplyFilters?.(search.filters)}
                  aria-label={`Применить фильтры "${search.name}"`}
                >
                  <Play className="w-3.5 h-3.5 mr-1" />
                  Применить
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Диалог сохранения */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Сохранить поиск</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label htmlFor="search-name" className="text-sm font-medium text-foreground mb-1 block">
                Название
              </label>
              <Input
                id="search-name"
                value={searchName}
                onChange={e => setSearchName(e.target.value)}
                placeholder="Напр.: 2-комн. в центре до 10 млн"
                maxLength={100}
                autoFocus
              />
            </div>
            {currentFilters && (
              <p className="text-xs text-muted-foreground">
                Фильтры: {formatFilters(currentFilters)}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSaveDialog(false)}>
              Отмена
            </Button>
            <Button
              onClick={handleSave}
              disabled={!searchName.trim() || isSaving}
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Подтверждение удаления */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="sm:max-w-[350px]">
          <DialogHeader>
            <DialogTitle>Удалить поиск?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Вы больше не будете получать уведомления по этой подписке.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteConfirmId(null)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
