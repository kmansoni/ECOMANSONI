# TanStack Query Patterns

## Описание

Скилл для работы с TanStack Query (React Query): queries, mutations, infinite scroll, prefetch, optimistic updates, cache invalidation. Основной инструмент data fetching в проекте.

## Когда использовать

- Любой запрос к Supabase / API
- CRUD операции с серверным состоянием
- Infinite scroll / pagination
- Prefetch данных при hover
- Optimistic UI для мгновенного отклика
- Фоновое обновление данных (refetch)

## Стек проекта

- `@tanstack/react-query` v5
- Supabase client для fetching
- `queryClient` в root провайдере

## Чеклист

- [ ] `queryKey` — массив, включает все зависимости (userId, filters)
- [ ] `staleTime` задан осознанно: 0 для real-time, 5min для справочников
- [ ] `useMutation` с `onSuccess` -> `invalidateQueries` для обновления кеша
- [ ] Optimistic update через `onMutate` + rollback в `onError`
- [ ] `enabled: !!dependency` — не запускать query без необходимых данных
- [ ] `select` для трансформации данных (не в компоненте)
- [ ] `placeholderData` для мгновенного UI при смене фильтров
- [ ] Error handling: `onError` callback или проверка `isError`

## Пример: query с Supabase

```tsx
function useMessages(chatId: string) {
  return useQuery({
    queryKey: ['messages', chatId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, content, sender_id, created_at, profiles(name, avatar_url)')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data
    },
    enabled: !!chatId,
    staleTime: 0, // real-time данные
  })
}
```

## Пример: mutation с optimistic update

```tsx
function useSendMessage(chatId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (content: string) => {
      const { data, error } = await supabase
        .from('messages')
        .insert({ chat_id: chatId, content })
        .select('id, content, sender_id, created_at')
        .single()
      if (error) throw error
      return data
    },
    onMutate: async (content) => {
      await qc.cancelQueries({ queryKey: ['messages', chatId] })
      const prev = qc.getQueryData(['messages', chatId])

      qc.setQueryData(['messages', chatId], (old: Message[] | undefined) => [
        { id: crypto.randomUUID(), content, sender_id: 'me', created_at: new Date().toISOString() },
        ...(old ?? []),
      ])

      return { prev }
    },
    onError: (_err, _content, ctx) => {
      if (ctx?.prev) qc.setQueryData(['messages', chatId], ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['messages', chatId] })
    },
  })
}
```

## Пример: infinite scroll

```tsx
function useInfiniteMessages(chatId: string) {
  return useInfiniteQuery({
    queryKey: ['messages', chatId, 'infinite'],
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, content, created_at')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .range(pageParam, pageParam + 19)
        .limit(20)
      if (error) throw error
      return data
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastParam) =>
      lastPage.length === 20 ? lastParam + 20 : undefined,
  })
}
```

## Паттерн: prefetch при hover

```tsx
function ChatListItem({ chat }: { chat: ChatPreview }) {
  const qc = useQueryClient()

  function prefetch() {
    qc.prefetchQuery({
      queryKey: ['messages', chat.id],
      queryFn: () => fetchMessages(chat.id),
      staleTime: 30_000,
    })
  }

  return (
    <Link to={`/chat/${chat.id}`} onMouseEnter={prefetch} onFocus={prefetch}>
      {chat.name}
    </Link>
  )
}
```

## Anti-patterns

| Плохо | Почему | Правильно |
|---|---|---|
| `queryKey: ['data']` без зависимостей | Все запросы шарят один кеш | `['messages', chatId, filters]` |
| `useEffect` + `useState` для fetch | Нет кеша, нет retry, нет stale/fresh | `useQuery` |
| `invalidateQueries` без ключа | Инвалидирует ВСЕ queries | Точный `queryKey` |
| Без `enabled` при отсутствии зависимости | Запрос с `undefined` параметром | `enabled: !!userId` |
| Transform данных в компоненте | Пересчёт при каждом рендере | `select` в query options |
| `onSuccess` в `useQuery` (v5 removed) | Deprecated, убрано в v5 | `useEffect` с `data` или `select` |
