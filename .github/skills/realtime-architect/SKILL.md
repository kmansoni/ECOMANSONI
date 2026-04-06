---
name: realtime-architect
description: "Архитектура Realtime: Supabase Realtime, Postgres Changes, Broadcast, Presence, управление подписками, reconnect стратегия. Use when: realtime, суперплатформа, WebSocket подписки, Supabase Realtime, онлайн-статус, typing indicator, live updates."
argument-hint: "[канал: messages | presence | broadcast | all]"
---

# Realtime Architect — Архитектура реального времени

---

## Три режима Supabase Realtime

```typescript
// 1. Postgres Changes — изменения в БД
supabase.channel('messages')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `channel_id=eq.${channelId}`,  // Фильтр на сервере
  }, handleNewMessage)
  .subscribe();

// 2. Broadcast — прямой p2p обмен сообщениями (не через БД)
supabase.channel(`typing:${channelId}`)
  .on('broadcast', { event: 'typing' }, ({ payload }) => {
    setTypingUsers(prev => ({ ...prev, [payload.userId]: Date.now() }));
  })
  .subscribe();

// Отправка broadcast
await supabase.channel(`typing:${channelId}`)
  .send({ type: 'broadcast', event: 'typing', payload: { userId: currentUserId } });

// 3. Presence — онлайн статусы
supabase.channel('online-users')
  .on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState();
    setOnlineUsers(Object.keys(state));
  })
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ user_id: userId, status: 'online' });
    }
  });
```

---

## Менеджер подписок (Zustand store)

```typescript
// src/stores/realtime-store.ts
// Централизованное управление — нет дублей subscriptions

interface RealtimeStore {
  channels: Map<string, RealtimeChannel>;
  subscribe: (key: string, factory: () => RealtimeChannel) => RealtimeChannel;
  unsubscribe: (key: string) => void;
  unsubscribeAll: () => void;
}

export const useRealtimeStore = create<RealtimeStore>((set, get) => ({
  channels: new Map(),

  subscribe: (key, factory) => {
    const existing = get().channels.get(key);
    if (existing) return existing; // Уже подписан

    const channel = factory();
    set(state => {
      const next = new Map(state.channels);
      next.set(key, channel);
      return { channels: next };
    });
    return channel;
  },

  unsubscribe: async (key) => {
    const channel = get().channels.get(key);
    if (!channel) return;
    await supabase.removeChannel(channel);
    set(state => {
      const next = new Map(state.channels);
      next.delete(key);
      return { channels: next };
    });
  },

  unsubscribeAll: async () => {
    const { channels } = get();
    await Promise.all([...channels.values()].map(c => supabase.removeChannel(c)));
    set({ channels: new Map() });
  },
}));
```

---

## Reconnect стратегия

```typescript
// src/hooks/useRealtimeMessages.ts
export function useRealtimeMessages(channelId: string) {
  const { subscribe, unsubscribe } = useRealtimeStore();

  useEffect(() => {
    const key = `messages:${channelId}`;

    const channel = subscribe(key, () =>
      supabase
        .channel(key)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`,
        }, (payload) => {
          if (payload.eventType === 'INSERT') {
            queryClient.setQueryData(queryKeys.messages(channelId), (old: Message[] = []) =>
              [...old.filter(m => !m._optimistic), payload.new as Message]
            );
          }
          if (payload.eventType === 'DELETE') {
            queryClient.setQueryData(queryKeys.messages(channelId), (old: Message[] = []) =>
              old.filter(m => m.id !== payload.old.id)
            );
          }
        })
        .subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR') {
            console.error('Realtime error:', err);
            // Supabase автоматически переподключается
          }
          if (status === 'TIMED_OUT') {
            // Принудительная переподписка
            unsubscribe(key);
            // Retry через useEffect re-run
          }
        })
    );

    return () => { unsubscribe(key); };
  }, [channelId]);
}
```

---

## Presence — typing indicator

```typescript
// Typing indicator с debounce и автоочисткой
export function useTypingIndicator(channelId: string) {
  const channel = useRealtimeStore(s => s.channels.get(`typing:${channelId}`));
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const sendTyping = useDebouncedCallback(async () => {
    await channel?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: currentUserId, ts: Date.now() },
    });
  }, 300, { maxWait: 1000 });

  // Очищать typing state через 3 секунды без активности
  const handleTypingEvent = useCallback(({ payload }: { payload: any }) => {
    setTypingUsers(prev => ({ ...prev, [payload.userId]: true }));
    clearTimeout(typingTimers.current.get(payload.userId));
    typingTimers.current.set(payload.userId,
      setTimeout(() => setTypingUsers(prev => {
        const next = { ...prev };
        delete next[payload.userId];
        return next;
      }), 3000)
    );
  }, []);

  return { sendTyping };
}
```

---

## Чеклист

- [ ] Subscriptions централизованы (нет дублей channels)
- [ ] Cleanup при unmount компонента
- [ ] Postgres Changes фильтрация на сервере (не весь поток)
- [ ] Broadcast для ephemeral данных (typing, reactions draft)
- [ ] Presence для онлайн-статуса пользователей
- [ ] Reconnect обрабатывается (TIMED_OUT → переподписка)
- [ ] unsubscribeAll() при logout пользователя
