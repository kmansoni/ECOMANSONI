/**
 * @file src/pages/ReelsPage.tsx
 * @description Full-screen вертикальный фид Reels с scroll-snap и виртуализацией.
 *
 * Архитектурные решения:
 * - Один IntersectionObserver (не per-item) — O(1) памяти при любом размере фида.
 * - Виртуализация: рендерим только currentIndex ± 1 (3 DOM-узла).
 *   Остальные — placeholder div с h-[100dvh], чтобы scroll-snap работал корректно.
 * - scroll-snap-type: y mandatory → залипание на каждом Reel без JS.
 * - 100dvh (dynamic viewport height) для iOS Safari с динамической адресной строкой.
 * - overscroll-behavior: contain → предотвращает pull-to-refresh Chrome/Safari.
 * - mapToFeedItem() изолирует разрыв между Reel (useReels) и ReelFeedItem (types).
 *
 * Lifecycle isReelsPage:
 *   mount  → setIsReelsPage(true)  [скрывает BottomNav]
 *   unmount → setIsReelsPage(false) [восстанавливает BottomNav]
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useReelsContext } from '@/contexts/ReelsContext';
import { useReels, type Reel } from '@/hooks/useReels';
import { ReelItem } from '@/components/reels/ReelItem';
import { ReelCommentsSheet } from '@/components/reels/ReelCommentsSheet';
import { ReelShareSheet } from '@/components/reels/ReelShareSheet';
import type { ReelFeedItem, ReelAuthor, ReelMetrics } from '@/types/reels';

// ---------------------------------------------------------------------------
// Константы
// ---------------------------------------------------------------------------

/** Порог видимости Intersection Observer: 50% = Reel считается "видимым" */
const IO_THRESHOLD = 0.5;

/** Сколько Reel до конца фида начинаем подгрузку следующей страницы */
const PREFETCH_AHEAD = 2;

// ---------------------------------------------------------------------------
// Маппинг Reel (хук) → ReelFeedItem (типы)
// Изолирует контракт useReels от контракта компонентов
// ---------------------------------------------------------------------------

/**
 * Преобразует сырой `Reel` из `useReels` в `ReelFeedItem`.
 *
 * Гарантии:
 *  - Никогда не выбрасывает исключение (все поля nullable обрабатываются gracefully)
 *  - Все числовые счётчики ≥ 0
 *  - `author.id` совпадает с `author_id` для навигации `/profile/:id`
 */
function mapToFeedItem(reel: Reel, index: number): ReelFeedItem {
  const author: ReelAuthor = {
    id: reel.author_id,
    username: reel.author_id, // username недоступен в useReels — используем id как fallback
    display_name: reel.author?.display_name ?? 'Пользователь',
    avatar_url: reel.author?.avatar_url ?? null,
    is_verified: reel.author?.verified ?? false,
    is_following: false, // состояние подписки не хранится в useReels
  };

  const metrics: ReelMetrics = {
    likes_count: Math.max(0, reel.likes_count ?? 0),
    comments_count: Math.max(0, reel.comments_count ?? 0),
    shares_count: Math.max(0, reel.shares_count ?? 0),
    saves_count: Math.max(0, reel.saves_count ?? 0),
    views_count: Math.max(0, reel.views_count ?? 0),
    reposts_count: Math.max(0, reel.reposts_count ?? 0),
  };

  return {
    id: reel.id,
    video_url: reel.video_url,
    thumbnail_url: reel.thumbnail_url ?? null,
    description: reel.description ?? null,
    music_title: reel.music_title ?? null,
    music_artist: null, // отсутствует в Reel, graceful null
    duration_seconds: reel.duration_seconds ?? 0,
    author,
    metrics,
    hashtags: [], // parseHashtags из description делать не обязательно на этом этапе
    created_at: reel.created_at,
    is_liked: reel.isLiked ?? false,
    is_saved: reel.isSaved ?? false,
    is_reposted: reel.isReposted ?? false,
    feed_position: reel.feed_position ?? index,
    recommendation_reason: reel.ranking_reason,
    final_score: reel.final_score,
  };
}

// ---------------------------------------------------------------------------
// Состояния загрузки
// ---------------------------------------------------------------------------

function ReelsSkeletonScreen(): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center"
      aria-label="Загрузка Reels"
    >
      {/* Пульсирующий placeholder на весь экран */}
      <div className="w-full h-[100dvh] bg-gradient-to-b from-zinc-900 to-zinc-800 animate-pulse" />
      {/* Имитация overlay */}
      <div className="absolute bottom-20 left-4 right-16 space-y-2">
        <div className="h-4 w-2/3 bg-zinc-700 rounded animate-pulse" />
        <div className="h-3 w-1/2 bg-zinc-700 rounded animate-pulse" />
        <div className="h-3 w-1/3 bg-zinc-700 rounded animate-pulse" />
      </div>
      {/* Имитация sidebar */}
      <div className="absolute bottom-20 right-4 flex flex-col gap-5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="w-8 h-8 rounded-full bg-zinc-700 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

interface ErrorScreenProps {
  onRetry: () => void;
}

function ReelsErrorScreen({ onRetry }: ErrorScreenProps): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center gap-6 px-6">
      <div className="text-6xl" role="img" aria-label="Ошибка">⚠️</div>
      <p className="text-white text-lg font-medium text-center">
        Не удалось загрузить Reels
      </p>
      <p className="text-zinc-400 text-sm text-center">
        Проверьте подключение к интернету и попробуйте снова
      </p>
      <button
        onClick={onRetry}
        className="mt-2 px-8 py-3 bg-white text-black font-semibold rounded-full active:scale-95 transition-transform"
      >
        Повторить
      </button>
    </div>
  );
}

function ReelsEmptyScreen(): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center gap-4 px-8">
      <div className="text-7xl" role="img" aria-label="Нет контента">🎬</div>
      <p className="text-white text-xl font-semibold text-center">
        Нет Reels для показа
      </p>
      <p className="text-zinc-400 text-sm text-center">
        Подпишитесь на авторов или загляните позже
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReelsPage
// ---------------------------------------------------------------------------

export default function ReelsPage(): JSX.Element {
  const { setIsReelsPage } = useReelsContext();
  const navigate = useNavigate();

  // ---------------------------------------------------------------------------
  // Данные из useReels
  // ---------------------------------------------------------------------------

  const {
    reels: rawReels,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    toggleLike,
    toggleSave,
    toggleRepost,
    recordImpression,
    recordView,
    refetch,
  } = useReels('reels');

  // ---------------------------------------------------------------------------
  // Локальный флаг ошибки
  // Хук useReels не экспортирует error — определяем «пустой + не loading» как error-state
  // только если loading=false, reels=[] и первоначальная загрузка завершилась неудачно.
  // Для этого отслеживаем, была ли когда-либо успешная загрузка.
  // ---------------------------------------------------------------------------

  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!loading) {
      setHasLoadedOnce(true);
    }
  }, [loading]);

  // Простейшая эвристика: если loading=false, rawReels=[],
  // и мы уже ждали первую загрузку — считаем ошибкой только если
  // поймали исключение (здесь не можем, useReels не пробрасывает error).
  // Поэтому loadError управляется вручную только через handleRetry.
  // По умолчанию пустой фид — это EmptyScreen, не ErrorScreen.

  const handleRetry = useCallback(() => {
    setLoadError(false);
    void refetch();
  }, [refetch]);

  // ---------------------------------------------------------------------------
  // Маппинг в ReelFeedItem[]
  // ---------------------------------------------------------------------------

  const feedItems: ReelFeedItem[] = useMemo(
    () => rawReels.map((r, i) => mapToFeedItem(r, i)),
    [rawReels],
  );

  // ---------------------------------------------------------------------------
  // Текущий индекс (определяется через IntersectionObserver)
  // ---------------------------------------------------------------------------

  const [currentIndex, setCurrentIndex] = useState(0);

  // Phase 5: Comments sheet state
  const [commentsReelId, setCommentsReelId] = useState<string | null>(null);

  // Phase 6: Share sheet state
  const [shareReelId, setShareReelId] = useState<string | null>(null);

  // Ref на DOM-узлы каждого Reel (включая placeholder-ы), индексированные позицией
  const itemRefs = useRef<Map<number, Element>>(new Map());

  // Единственный IntersectionObserver для всего фида
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Scroll container
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Lifecycle: isReelsPage + cleanup
  // ---------------------------------------------------------------------------

  useEffect(() => {
    setIsReelsPage(true);
    return () => {
      setIsReelsPage(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // IntersectionObserver: один экземпляр на весь фид
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Создаём observer с threshold=0.5
    const observer = new IntersectionObserver(
      (entries) => {
        // Из всех entries берём ту, у которой intersectionRatio максимален
        // (избегаем race condition когда одновременно входит/выходит два Reel)
        let maxRatio = 0;
        let maxIndex = -1;

        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            const idxAttr = (entry.target as HTMLElement).dataset.reelIndex;
            if (idxAttr !== undefined) {
              maxIndex = parseInt(idxAttr, 10);
            }
          }
        }

        if (maxIndex >= 0) {
          setCurrentIndex((prev) => {
            if (prev === maxIndex) return prev;
            return maxIndex;
          });
        }
      },
      {
        root: scrollContainerRef.current,
        threshold: IO_THRESHOLD,
      },
    );

    observerRef.current = observer;

    // Наблюдаем за всеми уже зарегистрированными элементами
    itemRefs.current.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
    // root зависит от scrollContainerRef.current, но он стабилен после mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Callback для регистрации/снятия наблюдения за элементом фида
  // ---------------------------------------------------------------------------

  const registerRef = useCallback((index: number, el: Element | null) => {
    const observer = observerRef.current;

    if (el) {
      itemRefs.current.set(index, el);
      if (observer) observer.observe(el);
    } else {
      const prev = itemRefs.current.get(index);
      if (prev && observer) observer.unobserve(prev);
      itemRefs.current.delete(index);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // recordImpression при смене currentIndex
  // ---------------------------------------------------------------------------

  const prevIndexRef = useRef<number>(-1);

  useEffect(() => {
    if (!feedItems[currentIndex]) return;
    if (prevIndexRef.current === currentIndex) return;
    prevIndexRef.current = currentIndex;

    const reel = feedItems[currentIndex];
    void recordImpression(reel.id);
    void recordView(reel.id);
  }, [currentIndex, feedItems, recordImpression, recordView]);

  // ---------------------------------------------------------------------------
  // Infinite scroll: подгружаем следующую страницу заблаговременно
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!hasMore) return;
    if (loadingMore) return;
    if (feedItems.length === 0) return;

    const distanceToEnd = feedItems.length - 1 - currentIndex;
    if (distanceToEnd <= PREFETCH_AHEAD) {
      loadMore();
    }
  }, [currentIndex, feedItems.length, hasMore, loadingMore, loadMore]);

  // ---------------------------------------------------------------------------
  // Callbacks для ReelItem (стабильные через useCallback)
  // ---------------------------------------------------------------------------

  const handleLike = useCallback(
    (reelId: string) => void toggleLike(reelId),
    [toggleLike],
  );

  const handleSave = useCallback(
    (reelId: string) => void toggleSave(reelId),
    [toggleSave],
  );

  const handleRepost = useCallback(
    (reelId: string) => void toggleRepost(reelId),
    [toggleRepost],
  );

  // Phase 6: Share sheet
  const handleShare = useCallback((reelId: string) => {
    setShareReelId(reelId);
  }, []);

  const handleShareClose = useCallback(() => {
    setShareReelId(null);
  }, []);

  // Phase 5: Comments sheet
  const handleComment = useCallback((reelId: string) => {
    setCommentsReelId(reelId);
  }, []);

  const handleCommentsClose = useCallback(() => {
    setCommentsReelId(null);
  }, []);

  const handleAuthorPress = useCallback(
    (authorId: string) => navigate(`/profile/${authorId}`),
    [navigate],
  );

  const handleHashtagPress = useCallback(
    (hashtag: string) => navigate(`/hashtag/${hashtag}`),
    [navigate],
  );

  // Phase N: Follow — noop пока
  const handleFollowPress = useCallback((_authorId: string) => {
    // TODO: Phase N — follow/unfollow
  }, []);

  // ---------------------------------------------------------------------------
  // Виртуализация: рендерить только currentIndex ± 1
  // ---------------------------------------------------------------------------

  const shouldRender = useCallback(
    (index: number) => Math.abs(index - currentIndex) <= 1,
    [currentIndex],
  );

  // ---------------------------------------------------------------------------
  // Render — состояния
  // ---------------------------------------------------------------------------

  if (loading && !hasLoadedOnce) {
    return <ReelsSkeletonScreen />;
  }

  if (loadError) {
    return <ReelsErrorScreen onRetry={handleRetry} />;
  }

  if (!loading && hasLoadedOnce && feedItems.length === 0) {
    return <ReelsEmptyScreen />;
  }

  // ---------------------------------------------------------------------------
  // Render — основной фид
  // ---------------------------------------------------------------------------

  return (
    <div
      className="fixed inset-0 bg-black overflow-hidden z-50"
      aria-label="Reels"
    >
      {/*
        Scroll container:
        - h-[100dvh]: dynamic viewport height (корректно на iOS с адресной строкой)
        - overflow-y-scroll: скролл только по Y
        - snap-y snap-mandatory: CSS scroll snap
        - overscroll-contain: блокирует pull-to-refresh
        - [scrollbar-width:none]: скрываем скроллбар Firefox
        - [-webkit-overflow-scrolling:touch]: плавный инерционный скролл iOS
      */}
      <div
        ref={scrollContainerRef}
        className={[
          'h-[100dvh] w-full',
          'overflow-y-scroll',
          'snap-y snap-mandatory',
          'overscroll-contain',
          '[scrollbar-width:none]',
          '[-webkit-overflow-scrolling:touch]',
          '[&::-webkit-scrollbar]:hidden',
        ].join(' ')}
        style={{
          // Принудительно GPU-слой для плавного scroll-snap
          willChange: 'scroll-position',
        }}
      >
        {feedItems.map((reel, index) => {
          const isActive = index === currentIndex;

          if (!shouldRender(index)) {
            // Placeholder: занимает ту же высоту что и ReelItem,
            // но не рендерит ни видео, ни DOM-тяжёлые компоненты.
            return (
              <div
                key={reel.id}
                ref={(el) => registerRef(index, el)}
                data-reel-index={index}
                className="h-[100dvh] w-full bg-black snap-start snap-always flex-shrink-0"
                aria-hidden="true"
              />
            );
          }

          return (
            <div
              key={reel.id}
              ref={(el) => registerRef(index, el)}
              data-reel-index={index}
              className="h-[100dvh] w-full flex-shrink-0 snap-start snap-always"
            >
              <ReelItem
                reel={reel}
                isActive={isActive}
                onLike={handleLike}
                onSave={handleSave}
                onRepost={handleRepost}
                onShare={handleShare}
                onComment={handleComment}
                onAuthorPress={handleAuthorPress}
                onHashtagPress={handleHashtagPress}
                onFollowPress={handleFollowPress}
              />
            </div>
          );
        })}

        {/* Loading more indicator: показывается после последнего Reel */}
        {loadingMore && (
          <div
            className="h-20 w-full flex items-center justify-center"
            aria-label="Загрузка следующей страницы"
          >
            <span className="inline-block w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Phase 5: Comments Sheet — рендерится поверх через createPortal */}
      {commentsReelId !== null && (
        <ReelCommentsSheet
          reelId={commentsReelId}
          isOpen={true}
          onClose={handleCommentsClose}
          commentsCount={
            feedItems.find((r) => r.id === commentsReelId)?.metrics
              .comments_count ?? 0
          }
        />
      )}

      {/* Phase 6: Share Sheet — рендерится через createPortal */}
      {shareReelId !== null && <ReelShareSheet
        reelId={shareReelId}
        isOpen
        onClose={handleShareClose}
      />}
    </div>
  );
}
