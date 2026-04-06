---
name: virtual-scroll-optimizer
description: "Виртуализация списков: react-virtuoso, windowing, dynamic row height, infinite scroll. Use when: список >100 элементов, чат-лента, каталог товаров, бесконечная прокрутка."
argument-hint: "[компонент или страница со списком]"
user-invocable: true
---

# Virtual Scroll Optimizer — Виртуализация списков

Скилл для оптимизации длинных списков через виртуализацию. Рендерим только видимые элементы, остальные — за пределами viewport.

## Когда использовать

- Список отображает >50 элементов
- Бесконечная прокрутка (чат, лента, каталог)
- Заметные лаги при скролле
- Высокое потребление памяти на мобильных

## Выбор инструмента

| Библиотека | Когда |
|---|---|
| `react-virtuoso` | Динамическая высота, чаты, группировка |
| `@tanstack/react-virtual` | Полный контроль, кастомные лейауты |
| Нативный CSS `content-visibility` | Простые случаи, не-списки |

## Протокол внедрения

1. **Измерь проблему** — React DevTools Profiler, сколько DOM-нод
2. **Определи тип списка** — фиксированная/динамическая высота, направление
3. **Выбери библиотеку** — react-virtuoso для большинства случаев
4. **Реализуй базовую виртуализацию** — замени map на Virtuoso
5. **Добавь infinite scroll** — `endReached` callback с подгрузкой
6. **Обработай пустое состояние** — `components={{ EmptyPlaceholder }}`
7. **Scroll restoration** — сохранение позиции при навигации
8. **Оптимизируй item render** — memo для элемента списка
9. **Протестируй** — 1000+ элементов, быстрый скролл, resize

## Базовый пример — react-virtuoso

```typescript
import { Virtuoso } from 'react-virtuoso'

interface MessageListProps {
  messages: Message[]
  onLoadMore: () => void
  hasMore: boolean
}

export function MessageList({ messages, onLoadMore, hasMore }: MessageListProps) {
  return (
    <Virtuoso
      data={messages}
      totalCount={messages.length}
      itemContent={(idx, msg) => <MessageItem key={msg.id} message={msg} />}
      endReached={() => { if (hasMore) onLoadMore() }}
      overscan={200}
      defaultItemHeight={72}
      components={{
        Footer: () => hasMore ? <LoadingSpinner /> : null,
        EmptyPlaceholder: () => <EmptyState text="Нет сообщений" />,
      }}
    />
  )
}
```

## Чат — обратная прокрутка

```typescript
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'
import { useRef, useCallback } from 'react'

export function ChatVirtualList({ messages, onLoadOlder }: ChatListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null)

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: messages.length - 1,
      behavior: 'smooth',
    })
  }, [messages.length])

  return (
    <Virtuoso
      ref={virtuosoRef}
      data={messages}
      initialTopMostItemIndex={messages.length - 1}
      firstItemIndex={Math.max(0, 10000 - messages.length)}
      itemContent={(idx, msg) => <ChatBubble message={msg} />}
      startReached={onLoadOlder}
      followOutput="smooth"
      overscan={300}
      alignToBottom
    />
  )
}
```

## Infinite scroll с TanStack Query

```typescript
import { useInfiniteQuery } from '@tanstack/react-query'

function useInfiniteMessages(channelId: string) {
  return useInfiniteQuery({
    queryKey: ['messages', channelId],
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, content, created_at, sender_id')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: false })
        .range(pageParam, pageParam + 49)
        .limit(50)
      if (error) throw error
      return data
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === 50 ? allPages.flat().length : undefined,
    initialPageParam: 0,
  })
}
```

## Чеклист

- [ ] DOM-нод в viewport <= 30 (проверь DevTools)
- [ ] overscan >= 200px (избегаем мерцания)
- [ ] Элемент списка обёрнут в React.memo
- [ ] Empty state при пустых данных
- [ ] Loading footer при подгрузке
- [ ] Scroll position сохраняется при навигации
- [ ] Тест с 1000+ элементов — нет лагов

## Anti-patterns

- **map без виртуализации** — 500 div в DOM. Браузер задыхается
- **Виртуализация без memo** — ререндер всех видимых при каждом скролле
- **overscan: 0** — белые дыры при быстром скролле
- **Вложенный скролл** — Virtuoso внутри overflow:scroll контейнера. Конфликт
- **Key по индексу** — `key={index}` при изменяемом списке. Только `key={item.id}`
- **Нет defaultItemHeight** — лишние перерасчёты layout при старте
