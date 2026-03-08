import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Radio } from 'lucide-react';
import { StreamCard, StreamCardSkeleton } from './StreamCard';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useActiveStreams } from '@/hooks/useLivestream';
import type { ActiveStreamsParams } from '@/types/livestream';

const CATEGORIES = ['Все', 'Gaming', 'Music', 'Talk Show', 'Education', 'Other'];
const PAGE_SIZE = 12;

/**
 * Responsive grid of live stream cards.
 * Includes category filter chips, infinite scroll, and skeleton loading.
 */
export function LiveStreamGrid({ className }: { className?: string }) {
  const [selectedCategory, setSelectedCategory] = useState<string>('Все');
  const [offset, setOffset] = useState(0);
  const [allLoaded, setAllLoaded] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const params: ActiveStreamsParams = {
    limit: PAGE_SIZE,
    offset,
    ...(selectedCategory !== 'Все' ? { category: selectedCategory } : {}),
  };

  const { data, isLoading, isFetching, refetch } = useActiveStreams(params);

  const streams = data?.data ?? [];
  const total = data?.total ?? 0;

  useEffect(() => {
    setOffset(0);
    setAllLoaded(false);
  }, [selectedCategory]);

  useEffect(() => {
    if (!isLoading && data) {
      setAllLoaded(streams.length >= total);
    }
  }, [data, isLoading, streams.length, total]);

  const loadMore = useCallback(() => {
    if (!allLoaded && !isFetching) {
      setOffset((o) => o + PAGE_SIZE);
    }
  }, [allLoaded, isFetching]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
  };

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Category filter chips */}
      <div
        className="flex gap-2 overflow-x-auto pb-1 no-scrollbar"
        role="tablist"
        aria-label="Filter by category"
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            role="tab"
            aria-selected={selectedCategory === cat}
            onClick={() => handleCategoryChange(cat)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              selectedCategory === cat
                ? 'bg-red-600 text-white'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700',
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Refresh button */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-300">
          {isLoading ? 'Загрузка…' : `${total} эфиров в прямом эфире`}
        </h2>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="h-7 w-7 text-zinc-400 hover:text-white"
          aria-label="Refresh streams"
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
        </Button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {isLoading && offset === 0
          ? Array.from({ length: 6 }).map((_, i) => (
              <StreamCardSkeleton key={i} />
            ))
          : streams.map((stream) => (
              <StreamCard key={stream.id} stream={stream} />
            ))}
      </div>

      {/* Empty state */}
      {!isLoading && streams.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-zinc-500">
          <Radio className="h-12 w-12 opacity-40" aria-hidden />
          <p className="text-sm font-medium">Нет активных эфиров</p>
          {selectedCategory !== 'Все' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedCategory('Все')}
              className="text-zinc-400"
            >
              Показать все категории
            </Button>
          )}
        </div>
      )}

      {/* Loading more indicator */}
      {isFetching && offset > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <StreamCardSkeleton key={`more-${i}`} />
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} aria-hidden="true" />
    </div>
  );
}
