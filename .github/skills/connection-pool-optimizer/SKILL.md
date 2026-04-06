---
name: connection-pool-optimizer
description: "Оптимизация connection pool Supabase/PostgreSQL: PgBouncer режимы, max_connections, idle timeout, statement_timeout. Use when: connection pool, PgBouncer, max connections, слишком много подключений, connection exhaustion."
argument-hint: "[сценарий: config | diagnosis | optimization | all]"
---

# Connection Pool Optimizer — Оптимизация пула подключений

---

## Supabase PgBouncer режимы

```
Supabase предоставляет два порта:
  5432  — Direct connection (session mode)
  6543  — Pooler connection (transaction mode)

Session mode (5432):
  - Одно соединение на клиента
  - Поддерживает ВСЕ PostgreSQL функции
  - Для: миграции, DDL, LISTEN/NOTIFY,advisory locks, prepared statements
  - Limit: ~100 connections на проекте

Transaction mode (6543, PgBouncer):
  - Соединение занято только на время транзакции
  - Эффективно: 1000+ клиентов → ~20 реальных соединений
  - НЕ поддерживает: SET SESSION, LISTEN, prepared statements, advisory session locks
  - Для: обычные SELECT/INSERT/UPDATE в приложении
```

---

## Конфигурация клиента Supabase

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    db: {
      schema: 'public',
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10, // Rate limit realtime events
      },
    },
    global: {
      headers: {
        'x-application-name': 'your-ai-companion',
      },
    },
  }
);
```

---

## Statement Timeout

```sql
-- Установить таймаут для предотвращения долгих запросов
-- В Edge Function (для текущей сессии):
ALTER ROLE authenticator SET statement_timeout = '30s';
ALTER ROLE anon SET statement_timeout = '10s';
ALTER ROLE authenticated SET statement_timeout = '30s';

-- Для конкретного запроса:
SET LOCAL statement_timeout = '5000';  -- 5 секунд
SELECT * FROM messages WHERE ...;
RESET statement_timeout;
```

---

## Диагностика исчерпания соединений

```sql
-- Текущие подключения
SELECT count(*), state, wait_event_type, wait_event
FROM pg_stat_activity
GROUP BY state, wait_event_type, wait_event
ORDER BY count DESC;

-- Долгие запросы (> 30 секунд)
SELECT pid, duration, left(query, 100) AS query_short, state
FROM (
  SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
  FROM pg_stat_activity
  WHERE query != '<IDLE>'
    AND query NOT ILIKE '%pg_stat_activity%'
) AS q
WHERE duration > INTERVAL '30 seconds'
ORDER BY duration DESC;

-- Убить зависшие запросы (осторожно!)
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE duration > INTERVAL '5 minutes'
  AND state = 'idle in transaction';
```

---

## Edge Functions — управление соединениями

```typescript
// supabase/functions/_shared/db.ts
// Создавать supabase client ВНУТРИ handler (не на уровне модуля)
// Edge Functions stateless — каждый вызов отдельный контекст

Deno.serve(async (req) => {
  // ✅ Client создаётся per-request с правильными правами
  const authHeader = req.headers.get('Authorization');
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader ?? '' } } }
  );

  // Установить таймаут для этого соединения
  await supabase.rpc('set_local_timeout', { timeout_ms: 10000 });

  // ... операции
});
```

---

## Чеклист

- [ ] Приложение использует порт 6543 (Pooler) для обычных запросов
- [ ] Миграции и DDL используют прямое соединение (5432)
- [ ] `statement_timeout` установлен для ролей
- [ ] Edge Functions создают client per-request
- [ ] Мониторинг: `pg_stat_activity` на аномалии
- [ ] `idle in transaction` соединения автоматически прерываются
