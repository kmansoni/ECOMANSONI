import { useEffect, useRef, useCallback } from 'react';
import { Eye, Clock, Trash2, MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePropertyViews } from '@/hooks/usePropertyViews';
import { cn } from '@/lib/utils';

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} дн назад`;
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

interface PropertyViewHistoryProps {
  onSelectProperty?: (propertyId: string) => void;
  /** Данные объектов для отображения фото/цены/адреса — передаются родителем */
  propertyDetails?: Map<string, { title: string; price: number; address: string; imageUrl: string | null }>;
}

function ViewHistorySkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-3 animate-pulse">
          <Skeleton className="w-20 h-20 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PropertyViewHistory({ onSelectProperty, propertyDetails }: PropertyViewHistoryProps) {
  const {
    viewHistory,
    isLoading,
    clearHistory,
    isClearingHistory,
    fetchMore,
    hasMore,
    isFetchingMore,
    refetch,
  } = usePropertyViews();

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const pullStartY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isRefreshing = useRef(false);

  // Бесконечная прокрутка
  useEffect(() => {
    if (!loadMoreRef.current) return;

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !isFetchingMore) {
          fetchMore();
        }
      },
      { threshold: 0.1 },
    );

    observerRef.current.observe(loadMoreRef.current);
    return () => { observerRef.current?.disconnect(); };
  }, [hasMore, isFetchingMore, fetchMore]);

  // Pull-to-refresh
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      pullStartY.current = e.touches[0].clientY;
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (pullStartY.current !== null && !isRefreshing.current) {
      const pullDistance = e.changedTouches[0].clientY - pullStartY.current;
      if (pullDistance > 60) {
        isRefreshing.current = true;
        refetch().finally(() => { isRefreshing.current = false; });
      }
    }
    pullStartY.current = null;
  }, [refetch]);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(price);

  if (isLoading) return <ViewHistorySkeleton />;

  if (viewHistory.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <Eye className="w-12 h-12 text-muted-foreground mb-4" aria-hidden="true" />
        <h3 className="text-lg font-semibold text-foreground mb-1">Нет просмотренных объектов</h3>
        <p className="text-sm text-muted-foreground max-w-[260px]">
          Просмотренные объекты недвижимости будут отображаться здесь
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Заголовок */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-base font-semibold text-foreground">
            История просмотров
          </h2>
          <span className="text-xs text-muted-foreground">({viewHistory.length})</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearHistory}
          disabled={isClearingHistory}
          className="text-destructive hover:text-destructive min-h-[44px] min-w-[44px]"
          aria-label="Очистить историю просмотров"
        >
          {isClearingHistory ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Список */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="divide-y divide-border">
          {viewHistory.map(view => {
            const details = propertyDetails?.get(view.property_id);
            return (
              <button
                key={view.id}
                type="button"
                onClick={() => onSelectProperty?.(view.property_id)}
                className={cn(
                  'flex gap-3 p-4 w-full text-left transition-colors',
                  'hover:bg-accent/50 active:bg-accent/70',
                  'min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
                aria-label={details ? `Объект: ${details.title}` : 'Просмотренный объект'}
              >
                {/* Фото */}
                <div className="w-20 h-20 rounded-lg bg-muted shrink-0 overflow-hidden">
                  {details?.imageUrl ? (
                    <img loading="lazy" src={details.imageUrl}
                      alt={details.title}
                      className="w-full h-full object-cover"
                      
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Eye className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
                    </div>
                  )}
                </div>

                {/* Информация */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {details?.title ?? 'Объект недвижимости'}
                  </p>
                  {details?.price != null && (
                    <p className="text-sm font-semibold text-primary mt-0.5">
                      {formatPrice(details.price)}
                    </p>
                  )}
                  {details?.address && (
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
                      <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
                      {details.address}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatTimeAgo(view.viewed_at)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Индикатор загрузки следующей страницы */}
        <div ref={loadMoreRef} className="py-4 flex justify-center">
          {isFetchingMore && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
        </div>
      </div>
    </div>
  );
}
