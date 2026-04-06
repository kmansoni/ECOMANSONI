---
name: retry-strategy
description: "Стратегии повторных попыток: exponential backoff, jitter, максимальное число попыток, retry только для определённых ошибок. Use when: retry, повторные попытки, сетевые ошибки, intermittent failures, backoff."
argument-hint: "[контекст: api-call | supabase | websocket | all]"
---

# Retry Strategy — Стратегии повторных попыток

Retry с exponential backoff + jitter предотвращает thundering herd и снижает нагрузку на восстанавливающийся сервис.

---

## Универсальный retry helper

```typescript
// src/lib/retry.ts
interface RetryOptions {
  maxAttempts?: number;       // Default: 3
  baseDelayMs?: number;       // Default: 1000
  maxDelayMs?: number;        // Default: 30000
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30_000,
    shouldRetry = isRetryable,
    onRetry,
  } = opts;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !shouldRetry(err, attempt)) throw err;

      // Exponential backoff с full jitter
      const exp = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const delay = Math.random() * exp; // full jitter — равномерный разброс
      onRetry?.(err, attempt, Math.round(delay));
      await sleep(delay);
    }
  }
  throw lastErr;
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

// Что стоит ретраить
function isRetryable(err: unknown): boolean {
  if (err instanceof TypeError && err.message.includes('network')) return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    // Сетевые ошибки — ретраить
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('timeout')) return true;
    // 429 Too Many Requests — ретраить
    if (msg.includes('429') || msg.includes('rate limit')) return true;
    // 503 Service Unavailable — ретраить
    if (msg.includes('503')) return true;
    // Auth ошибки — НЕ ретраить
    if (msg.includes('401') || msg.includes('403') || msg.includes('jwt')) return false;
    // 400 Bad Request — НЕ ретраить
    if (msg.includes('400') || msg.includes('422')) return false;
  }
  return false;
}
```

---

## Применение в Supabase запросах

```typescript
// Supabase запрос с retry
async function fetchMessagesWithRetry(channelId: string) {
  return withRetry(
    async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    {
      maxAttempts: 3,
      baseDelayMs: 500,
      onRetry: (err, attempt, delay) => {
        logger.warn('messages fetch retry', { attempt, delay, channelId });
      },
    }
  );
}
```

---

## React Query интеграция

```typescript
// TanStack Query — встроенный retry
useQuery({
  queryKey: ['messages', channelId],
  queryFn: () => fetchMessages(channelId),
  retry: (failureCount, error) => {
    // Не ретраить auth ошибки
    if (error?.status === 401 || error?.status === 403) return false;
    return failureCount < 3;
  },
  retryDelay: (attemptIndex) =>
    Math.min(1000 * 2 ** attemptIndex + Math.random() * 1000, 30_000),
});
```

---

## Стратегии задержки

| Стратегия | Формула | Когда использовать |
|---|---|---|
| Fixed | `delay = base` | Простые случаи |
| Linear | `delay = base * attempt` | Умеренная нагрузка |
| Exponential | `delay = base * 2^attempt` | Rate limiting |
| Exponential + Full Jitter | `delay = random(0, base * 2^attempt)` | **Рекомендуется** |
| Exponential + Equal Jitter | `delay = base * 2^attempt / 2 + random(0, base * 2^attempt / 2)` | Предсказуемость |

---

## Чеклист

- [ ] Retry только для идемпотентных операций (GET, DELETE с проверкой, не POST создание)
- [ ] Exponential backoff + jitter (не fixed delay)
- [ ] Максимальное число попыток (не бесконечно)
- [ ] Не ретраить auth (401, 403) и validation (400, 422) ошибки
- [ ] Логирование retry попыток
- [ ] AbortController для отмены при unmount компонента
