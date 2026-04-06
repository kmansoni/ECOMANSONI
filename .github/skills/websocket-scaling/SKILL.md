# WebSocket Scaling

## Описание

Масштабирование WebSocket-соединений: лимиты, переподключение, heartbeat, балансировка нагрузки.

## Когда использовать

- Чат с > 1000 одновременных пользователей
- Real-time dashboard с частыми обновлениями
- Коллаборативное редактирование
- Live-трекинг (такси, доставка)
- Любой сценарий с persistent connection

## Управление соединениями

### Reconnection с exponential backoff

```typescript
function createReconnectingSocket(url: string) {
  let attempt = 0;
  let ws: WebSocket | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval>;

  function connect() {
    ws = new WebSocket(url);

    ws.onopen = () => {
      attempt = 0;
      startHeartbeat();
    };

    ws.onclose = (event) => {
      stopHeartbeat();
      if (!event.wasClean) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        attempt++;
        setTimeout(connect, delay + Math.random() * 1000);
      }
    };

    ws.onerror = () => ws?.close();
  }

  function startHeartbeat() {
    heartbeatTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000); // < 30s nginx timeout
  }

  function stopHeartbeat() {
    clearInterval(heartbeatTimer);
  }

  connect();
  return { getSocket: () => ws, close: () => ws?.close() };
}
```

### Visibility API — пауза при скрытии вкладки

```typescript
function useVisibilityAwareSocket(channel: RealtimeChannel) {
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) {
        // Снижаем активность, но не отключаемся
        channel.send({ type: 'broadcast', event: 'idle', payload: {} });
      } else {
        // Запросить пропущенные обновления
        channel.send({ type: 'broadcast', event: 'sync_request', payload: {} });
      }
    }

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [channel]);
}
```

## Лимиты Supabase Realtime

| Параметр | Лимит |
|----------|-------|
| Каналы на соединение | 100 |
| Сообщений/сек на канал | 100 (broadcast) |
| Payload размер | 1 MB |
| Присутствие на канал | ~100 оптимально |
| Соединений на проект | зависит от плана |

## Heartbeat и таймауты

```
Клиент                    Сервер
   │──── ping ──────────►│
   │◄──── pong ───────────│    каждые 25 секунд
   │                      │
   │  (нет pong 60s)      │
   │──── reconnect ──────►│    клиент переподключается
```

## Оффлайн-очередь

```typescript
const pendingMessages: Array<{ event: string; payload: unknown }> = [];

function sendOrQueue(channel: RealtimeChannel, event: string, payload: unknown) {
  if (channel.state === 'joined') {
    channel.send({ type: 'broadcast', event, payload });
  } else {
    pendingMessages.push({ event, payload });
  }
}

// При переподключении — отправить накопленное
function flushQueue(channel: RealtimeChannel) {
  while (pendingMessages.length > 0) {
    const msg = pendingMessages.shift();
    if (msg) channel.send({ type: 'broadcast', event: msg.event, payload: msg.payload });
  }
}
```

## Мониторинг

```sql
-- Активные Realtime подписки (Supabase dashboard)
-- Метрики для мониторинга:
-- 1. Количество активных соединений
-- 2. Сообщений/сек
-- 3. Latency p99
-- 4. Reconnection rate
-- 5. Error rate по типам
```

## Чеклист

1. **Reconnection** — exponential backoff с jitter
2. **Heartbeat** — ping каждые 25s (< серверного timeout)
3. **Visibility API** — пауза при скрытии вкладки
4. **Offline queue** — буферизация сообщений при disconnect
5. **Cleanup** — отписка от каналов при unmount компонента
6. **Dedup** — обработка дублей при переподключении

## Anti-patterns

- Reconnect без backoff — DDoS на свой сервер при массовом disconnect
- Heartbeat > server timeout — соединение умирает молча
- Нет cleanup при unmount — утечка соединений
- Один глобальный канал на все данные — bottleneck
- Отправка при closed socket — silent data loss
- Polling как fallback без реального fallback — двойная нагрузка
