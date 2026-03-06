import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Car } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTaxiHistory } from '@/hooks/taxi/useTaxiHistory';
import { TripHistoryCard } from '@/components/taxi/TripHistoryCard';
import { Skeleton } from '@/components/ui/skeleton';
import type { TripHistoryItem } from '@/types/taxi';

const FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'completed', label: 'Завершённые' },
  { value: 'cancelled', label: 'Отменённые' },
] as const;

export default function TaxiHistoryPage() {
  const navigate = useNavigate();
  const { items, total, hasMore, isLoading, error, filter, setFilter, loadMore, refresh } =
    useTaxiHistory();

  const handleTripClick = (trip: TripHistoryItem) => {
    // В production: navigate(`/taxi/trip/${trip.id}`)
    // MVP: просто показываем информацию
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3 pt-safe">
          <button
            onClick={() => navigate('/taxi')}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
            aria-label="Назад"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold flex-1">История поездок</h1>
          <button
            onClick={refresh}
            disabled={isLoading}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
            aria-label="Обновить"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </button>
        </div>

        {/* Фильтры */}
        <div className="flex items-center gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                'flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                filter === f.value
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Контент */}
      <div className="px-4 py-4 space-y-3">
        {/* Счётчик */}
        {!isLoading && total > 0 && (
          <p className="text-xs text-muted-foreground">
            {total} {total === 1 ? 'поездка' : total < 5 ? 'поездки' : 'поездок'}
          </p>
        )}

        {/* Ошибка */}
        {error && (
          <div className="text-center py-8">
            <p className="text-muted-foreground text-sm">{error}</p>
            <button
              className="mt-2 text-sm text-blue-600 underline"
              onClick={refresh}
            >
              Попробовать снова
            </button>
          </div>
        )}

        {/* Skeleton */}
        {isLoading && items.length === 0 && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
            ))}
          </div>
        )}

        {/* Список поездок */}
        {items.map((trip) => (
          <TripHistoryCard
            key={trip.id}
            trip={trip}
            onClick={handleTripClick}
          />
        ))}

        {/* Загрузить ещё */}
        {hasMore && !isLoading && (
          <button
            type="button"
            onClick={loadMore}
            className="w-full py-3 text-sm text-blue-600 font-medium hover:text-blue-700 transition-colors"
          >
            Загрузить ещё
          </button>
        )}

        {/* Пустое состояние */}
        {!isLoading && !error && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Car className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg">Поездок пока нет</h3>
            <p className="text-muted-foreground text-sm mt-1 max-w-xs">
              {filter === 'all'
                ? 'Закажите первую поездку, чтобы она появилась здесь'
                : 'Нет поездок с таким статусом'}
            </p>
            {filter === 'all' && (
              <button
                className="mt-4 px-6 py-2.5 rounded-full bg-black text-white text-sm font-semibold"
                onClick={() => navigate('/taxi')}
              >
                Заказать такси
              </button>
            )}
          </div>
        )}
      </div>

      {/* Нижний отступ */}
      <div className="h-8" />
    </div>
  );
}
