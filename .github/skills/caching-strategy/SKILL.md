---
name: caching-strategy
description: "Стратегии кэширования: TanStack Query cache, stale-while-revalidate, localStorage persistence, оптимистичные обновления, инвалидация кэша. Use when: кэш, кэширование, stale data, cache invalidation, optimistic updates, TanStack Query."
argument-hint: "[слой: memory | localStorage | tanstack-query | all]"
---

# Caching Strategy — Стратегии кэширования

---

## TanStack Query — рекомендуемые настройки

```typescript
// src/lib/query-client.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale-while-revalidate: данные свежие 30с, кэш живёт 5 минут
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      // Не рефетчить при фокусе окна для частых данных
      refetchOnWindowFocus: false,
      // Retry с backoff
      retry: (count, err: any) => count < 2 && err?.status !== 401,
      retryDelay: (n) => Math.min(1000 * 2 ** n, 10_000),
    },
    mutations: {
      retry: 0, // Мутации не ретраить по умолчанию
    },
  },
});
```

---

## Ключи кэша — структура

```typescript
// Централизованные ключи кэша (предотвращает опечатки)
export const queryKeys = {
  profile: (userId: string) => ['profile', userId] as const,
  messages: (channelId: string, page = 0) => ['messages', channelId, page] as const,
  channels: (userId: string) => ['channels', userId] as const,
  channelMembers: (channelId: string) => ['channel-members', channelId] as const,
  unreadCount: (userId: string) => ['unread', userId] as const,
} as const;

// Инвалидация всех messages для канала при новом сообщении
queryClient.invalidateQueries({ queryKey: ['messages', channelId] });
```

---

## Оптимистичные обновления

```typescript
// Мгновенное обновление UI без ожидания сервера
const sendMessage = useMutation({
  mutationFn: (text: string) => api.sendMessage(channelId, text),

  onMutate: async (text) => {
    // Отменить текущие запросы (чтобы не перезатёрли оптимистичное обновление)
    await queryClient.cancelQueries({ queryKey: queryKeys.messages(channelId) });

    // Сохранить старые данные для rollback
    const prev = queryClient.getQueryData(queryKeys.messages(channelId));

    // Добавить оптимистичное сообщение
    const optimistic = {
      id: `opt-${Date.now()}`,
      content: text,
      sender_id: currentUserId,
      created_at: new Date().toISOString(),
      _optimistic: true,
    };
    queryClient.setQueryData(queryKeys.messages(channelId), (old: any[]) =>
      [...(old ?? []), optimistic]
    );

    return { prev };
  },

  onError: (_err, _vars, context) => {
    // Rollback при ошибке
    queryClient.setQueryData(queryKeys.messages(channelId), context?.prev);
    toast.error('Не удалось отправить сообщение');
  },

  onSettled: () => {
    // Обновить реальными данными в любом случае
    queryClient.invalidateQueries({ queryKey: queryKeys.messages(channelId) });
  },
});
```

---

## localStorage Persistence

```typescript
// Persist критических данных для офлайн-режима
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'app-cache',
  // Максимум 4MB (localStorage limit ~5MB)
  serialize: (data) => {
    const limited = {
      ...data,
      clientState: {
        ...data.clientState,
        // Персистировать только profile и channels (не messages — слишком много)
        queries: data.clientState.queries.filter(q =>
          q.queryKey[0] === 'profile' || q.queryKey[0] === 'channels'
        ),
      },
    };
    return JSON.stringify(limited);
  },
});

persistQueryClient({ queryClient, persister, maxAge: 24 * 60 * 60 * 1000 });
```

---

## Realtime + Cache синхронизация

```typescript
// Обновление кэша при Realtime событии (новое сообщение)
useEffect(() => {
  const channel = supabase.channel(`messages:${channelId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => {
        queryClient.setQueryData(queryKeys.messages(channelId), (old: Message[]) => {
          if (!old) return [payload.new as Message];
          // Dedup: убрать оптимистичное если есть
          const filtered = old.filter(m => !m._optimistic);
          return [...filtered, payload.new as Message];
        });
      }
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [channelId]);
```

---

## Стратегии по типу данных

| Данные | staleTime | gcTime | Стратегия |
|---|---|---|---|
| Профиль пользователя | 5 мин | 30 мин | Cache + SWR |
| Список каналов | 1 мин | 10 мин | Cache + Realtime update |
| Сообщения | 0 (всегда fresh) | 5 мин | Realtime + optimistic |
| Непрочитанные | 0 | 1 мин | Realtime push |
| Публичные профили | 10 мин | 1 час | Long cache |

---

## Чеклист

- [ ] Централизованные queryKeys (нет магических строк)
- [ ] staleTime и gcTime выставлены по типу данных
- [ ] Оптимистичные обновления для mutations с rollback
- [ ] Realtime события обновляют кэш без полного рефетча
- [ ] localStorage persistence только для критических данных
- [ ] Инвалидация при logout (`queryClient.clear()`)
