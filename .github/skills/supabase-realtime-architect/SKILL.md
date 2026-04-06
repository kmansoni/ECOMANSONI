# Supabase Realtime Architect

## Описание

Проектирование и реализация real-time функциональности через Supabase Realtime: channels, presence, broadcast, postgres changes.

## Когда использовать

- Чат / мессенджер — доставка сообщений
- Онлайн-статусы — presence
- Коллаборативное редактирование — broadcast
- Live-уведомления — postgres changes
- Типизация "печатает..." — broadcast ephemeral

## Каналы Supabase Realtime

### 1. Postgres Changes (Row-level)

```typescript
const channel = supabase
  .channel('messages-room-123')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: 'room_id=eq.123',
    },
    (payload) => {
      addMessage(payload.new as Message);
    }
  )
  .subscribe();
```

### 2. Broadcast (Ephemeral, без БД)

```typescript
// Отправка "печатает..."
const channel = supabase.channel('room-123');
channel.send({
  type: 'broadcast',
  event: 'typing',
  payload: { userId: currentUser.id, isTyping: true },
});

// Приём
channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
  setTypingUsers((prev) => updateTyping(prev, payload));
});
```

### 3. Presence (Кто онлайн)

```typescript
const channel = supabase.channel('online-users');
channel
  .on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState<{ user_id: string }>();
    setOnlineUsers(Object.keys(state));
  })
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ user_id: currentUser.id });
    }
  });
```

## Чеклист реализации

1. **Unsubscribe** — ВСЕГДА отписываться в cleanup (`useEffect` return)
2. **Reconnection** — обработать `CHANNEL_ERROR`, `TIMED_OUT`
3. **Duplicate events** — idempotent handler (проверка по id)
4. **Filter** — ВСЕГДА фильтр на канале, не `SELECT *` на всю таблицу
5. **Rate limit** — broadcast max 10 msg/sec на канал
6. **Presence** — max ~100 concurrent per channel для стабильности
7. **RLS** — postgres_changes уважает RLS, broadcast — нет (авторизация вручную)

## Управление подключением

```typescript
function useRealtimeChannel(channelName: string) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const channel = supabase.channel(channelName);
    channelRef.current = channel;

    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        // Supabase SDK автоматически переподключается
        // но логируем для мониторинга
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName]);

  return channelRef;
}
```

## Performance

- Один канал на комнату чата, не на сообщение
- Presence sync — batch, приходит целиком, не diff
- Broadcast для эфемерных данных (курсор, typing) — не писать в БД
- Postgres Changes для персистентных данных (сообщения, статусы)

## Anti-patterns

- Подписка на всю таблицу без `filter` — перегрузка клиента
- Отсутствие `removeChannel` в cleanup — утечка соединений
- Presence для 1000+ пользователей в одном канале — OOM
- Broadcast для критичных данных без fallback в БД
- Повторный `subscribe()` без проверки текущего статуса канала
- Хранение реального состояния ТОЛЬКО в presence (потеря при disconnect)
