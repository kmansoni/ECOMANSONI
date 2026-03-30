---
name: recovery-engineer
description: "Recovery paths: reconnect, retry, refresh, timeout, partial failure, stale state, rollback, double-submit. Use when: доводка recovery, обработка отказов, resilience, offline-режим, reconnect."
argument-hint: "[компонент или модуль для проверки/реализации recovery paths]"
user-invocable: true
---

# Recovery Engineer — Инженерия восстановления

Проверяет и реализует пути восстановления (recovery paths) для всех сценариев отказа. Пользователь никогда не должен оказаться в тупике.

## Принцип

> Каждый сетевой вызов может упасть. Каждый WebSocket может отключиться. Каждый таб может быть закрыт. Recovery — не фича, а обязательная часть каждой функции.

## Каталог сценариев отказа

### Сеть

| Сценарий | Ожидаемое поведение |
|----------|---------------------|
| Потеря сети на 5 секунд | Очередь сообщений, отправка при reconnect |
| Потеря сети на 30+ секунд | Индикатор "Нет соединения", retry с backoff |
| Медленная сеть (3G) | Skeleton/spinner, timeout ≤30s, cancel возможен |
| Таймаут запроса | Toast с ошибкой + кнопка "Повторить" |
| DNS failure | Graceful degradation, не белый экран |

### WebSocket / Realtime

| Сценарий | Ожидаемое поведение |
|----------|---------------------|
| WS disconnect | Auto-reconnect с exponential backoff |
| WS reconnect после паузы | Sync missed events (fetch delta) |
| WS flapping (connect/disconnect) | Cooldown, не спамить reconnect |
| Server restart | Reconnect + re-subscribe |

### UI / Браузер

| Сценарий | Ожидаемое поведение |
|----------|---------------------|
| F5 / refresh | Состояние восстанавливается (URL + store) |
| Back button | Навигация корректна, не ломает state |
| Закрытие таба во время операции | Операция завершается или откатывается |
| Двойной клик | Debounce или disable, НЕ двойная отправка |
| Stale tab (вернулся через час) | Refetch данных, не показывать устаревшее |

### Данные

| Сценарий | Ожидаемое поведение |
|----------|---------------------|
| Optimistic update + ошибка сервера | Rollback UI к предыдущему состоянию |
| Partial write (часть операции прошла) | Консистентный откат или довершение |
| Concurrent edit (два пользователя) | Last-write-wins или merge + уведомление |
| Стор в невалидном состоянии | Reset к initial + refetch |

### Auth

| Сценарий | Ожидаемое поведение |
|----------|---------------------|
| Token expired | Auto-refresh, retry original request |
| Session revoked | Redirect to login, clear local data |
| 403 на ресурс | Показать "Нет доступа", не крашить |

## Паттерны реализации

### 1. Retry с exponential backoff
```typescript
// backoff: 1s → 2s → 4s → 8s → max 30s
const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
```

### 2. Debounce / disable для кнопок
```typescript
const [isPending, startTransition] = useTransition();
// кнопка: disabled={isPending}
```

### 3. Optimistic rollback
```typescript
// TanStack Query: onMutate → save previous, onError → rollback
const mutation = useMutation({
  onMutate: async (newData) => {
    await queryClient.cancelQueries({ queryKey });
    const previous = queryClient.getQueryData(queryKey);
    queryClient.setQueryData(queryKey, newData);
    return { previous };
  },
  onError: (_err, _new, context) => {
    queryClient.setQueryData(queryKey, context?.previous);
  },
});
```

### 4. Stale tab detection
```typescript
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    queryClient.invalidateQueries();
  }
});
```

### 5. WS reconnect с delta sync
```
1. Disconnect detected
2. Save last_event_ts
3. Reconnect with backoff
4. Fetch events since last_event_ts
5. Apply delta, resume subscription
```

## Процесс проверки

### 1. Инвентарь точек отказа
Для каждого файла определи:
- Сетевые вызовы (supabase.from(), fetch(), WS)
- Мутации (insert, update, delete)
- Подписки (Realtime channels)
- Навигация (useNavigate, window.location)

### 2. Проверь каждую точку
- Что происходит при ошибке? (catch → ?)
- Есть ли retry? (автоматический или ручной)
- Показывается ли ошибка пользователю?
- Восстанавливается ли UI после ошибки?
- Есть ли timeout?

### 3. Классификация

| Уровень | Описание |
|---------|----------|
| 🔴 ТУПИК | Пользователь застрял без возможности восстановления |
| 🟠 ДЕГРАДАЦИЯ | Работает, но с потерей данных/состояния |
| 🟡 НЕУДОБСТВО | Работает, но не optimal UX |
| 🟢 ПОЛНОЕ ВОССТАНОВЛЕНИЕ | Recovery path реализован |

## Формат вывода

```
## Recovery Audit — {модуль}

### Точки отказа: X найдено

| # | Файл:строка | Тип | Recovery | Уровень |
|---|-------------|-----|----------|---------|
| 1 | hooks/useMessages.ts:42 | Supabase query | catch → toast | 🟡 |
| 2 | components/ChatInput.tsx:88 | Mutation | Нет retry | 🟠 |
| 3 | hooks/useRealtime.ts:15 | WS subscribe | Нет reconnect | 🔴 |

### 🔴 Тупики (требуют немедленного исправления)
1. {описание + конкретное решение}

### 🟠 Деградации (требуют доработки)
1. {описание + конкретное решение}

### Рекомендации
- {конкретные шаги с примерами кода}
```

## Специфика проекта

- Supabase Realtime: reconnect на channel level, не на socket level
- Capacitor (мобилка): App.addListener('resume') для stale state
- Zustand stores: persist middleware для critical state
- TanStack Query: gcTime, staleTime для управления кэшом
- Edge Functions: idempotency key для мутаций
