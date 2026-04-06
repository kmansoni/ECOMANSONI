---
name: intersection-observer-patterns
description: "IntersectionObserver паттерны: lazy loading, infinite scroll, read receipts, вирутализация. Use when: lazy load, infinite scroll, видимость элемента, lazy images, mark as read, read receipts, virtualization."
argument-hint: "[usecase: lazy-load | infinite-scroll | read-receipt | all]"
---

# Intersection Observer Patterns

---

## Базовый хук

```typescript
// src/hooks/useIntersectionObserver.ts
export function useIntersectionObserver(
  options: IntersectionObserverInit = { threshold: 0.1 }
) {
  const ref = useRef<Element | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting);
    }, options);
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [options.threshold, options.rootMargin]);

  return { ref, isVisible };
}
```

---

## Lazy Loading изображений

```tsx
function LazyImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const { ref, isVisible } = useIntersectionObserver({ threshold: 0, rootMargin: '200px' });
  const [loaded, setLoaded] = useState(false);

  return (
    <div ref={ref as React.RefObject<HTMLDivElement>} className={cn('bg-muted', className)}>
      {isVisible && (
        <img
          src={src}
          alt={alt}
          onLoad={() => setLoaded(true)}
          className={cn('transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0', className)}
          loading="lazy"  // Нативный fallback
          decoding="async"
        />
      )}
    </div>
  );
}
```

---

## Infinite Scroll

```tsx
// Загружаем следующую страницу когда "sentinel" элемент виден
function MessageList({ channelId }: { channelId: string }) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: queryKeys.messages(channelId),
      queryFn: ({ pageParam = 0 }) => fetchMessages(channelId, pageParam),
      getNextPageParam: (last, pages) => last.length === 50 ? pages.length : undefined,
    });

  const { ref: sentinelRef } = useIntersectionObserver({ threshold: 1.0 });

  // Триггер на видимость sentinel
  useEffect(() => {
    if (isVisible && hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [isVisible, hasNextPage]);

  return (
    <div>
      {/* Sentinel вверху для обратной прокрутки истории */}
      <div ref={sentinelRef} />
      {isFetchingNextPage && <LoadingSkeleton />}
      {data?.pages.flatMap(p => p).map(msg => <MessageBubble key={msg.id} message={msg} />)}
    </div>
  );
}
```

---

## Read Receipts — помечать сообщение прочитанным

```tsx
// Сообщение прочитано когда пользователь видел его ≥ 1 секунду
function MessageBubble({ message }: { message: Message }) {
  const { ref, isVisible } = useIntersectionObserver({ threshold: 0.8 });
  const marked = useRef(false);

  useEffect(() => {
    if (!isVisible || marked.current || message.is_read) return;
    // Debounce: подождать 1 секунду видимости
    const timer = setTimeout(async () => {
      marked.current = true;
      await supabase.rpc('mark_message_read', { message_id: message.id });
    }, 1000);
    return () => clearTimeout(timer);
  }, [isVisible, message.id]);

  return (
    <div ref={ref as React.RefObject<HTMLDivElement>}>
      {/* Контент сообщения */}
    </div>
  );
}
```

---

## Sticky Header Detection

```tsx
// Определить когда header закрепился (для shadow эффекта)
function StickyHeader() {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isSticky, setIsSticky] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsSticky(!entry.isIntersecting),
      { threshold: [1] }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} style={{ height: '1px' }} />
      <header className={cn('sticky top-0 transition-shadow', isSticky && 'shadow-md')}>
        Заголовок
      </header>
    </>
  );
}
```

---

## Чеклист

- [ ] rootMargin: '200px' для preload (загрузить до появления)
- [ ] disconnect() при unmount (утечка памяти)
- [ ] Один observer на список (не per-item) для производительности
- [ ] threshold: 0.8-1.0 для read receipts (реально прочитано)
- [ ] Debounce read receipt (не сразу, а после секунды видимости)
- [ ] `loading="lazy"` + `decoding="async"` на img как fallback
