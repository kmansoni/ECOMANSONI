---
name: distributed-lock
description: "Распределённые блокировки в PostgreSQL: advisory locks, pg_try_advisory_lock, FOR UPDATE SKIP LOCKED, предотвращение race conditions. Use when: distributed lock, mutex, предотвратить параллельное выполнение, advisory lock, FOR UPDATE."
argument-hint: "[операция требующая блокировки]"
---

# Distributed Lock — Распределённые блокировки

PostgreSQL advisory locks — наиболее эффективный механизм распределённых блокировок для Supabase/PostgreSQL стека.

---

## Advisory Locks

```sql
-- Session-level advisory lock (блокирует до конца сессии или явного unlock)
-- НЕ работает с PgBouncer transaction mode! Использовать transaction-level:

-- Transaction-level advisory lock (освобождается при COMMIT/ROLLBACK)
SELECT pg_try_advisory_xact_lock(hashtext('daily-digest-job'));
-- Возвращает TRUE если блокировка получена, FALSE если уже занята

-- Пример: запуск scheduled job без дублирования
CREATE OR REPLACE FUNCTION run_daily_digest()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Попытаться получить блокировку (без ожидания)
  IF NOT pg_try_advisory_xact_lock(hashtext('run_daily_digest')) THEN
    RAISE NOTICE 'Daily digest already running, skipping';
    RETURN;
  END IF;

  -- Защищённая зона
  PERFORM send_digest_notifications();
END;
$$;
```

---

## FOR UPDATE SKIP LOCKED — очerede обработки

```sql
-- Паттерн "честной очереди" для фоновых задач
-- (когда несколько воркеров берут задачи из одной таблицы)

CREATE TABLE background_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts INTEGER DEFAULT 0,
  scheduled_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Воркер: взять следующую задачу (без конкуренции)
BEGIN;
  WITH next_job AS (
    SELECT id FROM background_jobs
    WHERE status = 'pending' AND scheduled_at <= now()
    ORDER BY scheduled_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED  -- Пропустить строки захваченные другими воркерами
  )
  UPDATE background_jobs
  SET status = 'processing', attempts = attempts + 1
  WHERE id = (SELECT id FROM next_job)
  RETURNING *;
COMMIT;
```

---

## Использование из Edge Function

```typescript
// supabase/functions/process-job/index.ts
Deno.serve(async (req) => {
  // Получить блокировку через SQL
  const { data: lockAcquired } = await supabase.rpc('try_acquire_job_lock', {
    lock_name: 'process-notifications',
  });

  if (!lockAcquired) {
    return new Response('Already running', { status: 409 });
  }

  try {
    await processNotifications();
    return new Response('OK');
  } catch (err) {
    return new Response('Error', { status: 500 });
  }
  // Lock автоматически освобождается при конце транзакции
});
```

```sql
-- SQL функция для Edge Function
CREATE OR REPLACE FUNCTION try_acquire_job_lock(lock_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
AS $$
  SELECT pg_try_advisory_xact_lock(hashtext(lock_name));
$$;
```

---

## FOR UPDATE — обновление с блокировкой строки

```sql
-- Безопасное списание кредитов (предотвращение race condition)
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id UUID,
  p_amount INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  -- Блокировать строку пользователя
  SELECT credits INTO v_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;  -- Другие транзакции будут ждать

  IF v_balance < p_amount THEN
    RETURN FALSE;  -- Недостаточно кредитов
  END IF;

  UPDATE profiles
  SET credits = credits - p_amount
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$;
```

---

## Чеклист

- [ ] Advisory locks для singleton операций (cron jobs, одиночные воркеры)
- [ ] `pg_try_advisory_xact_lock` (не `pg_try_advisory_lock`) — для PgBouncer совместимости
- [ ] `FOR UPDATE SKIP LOCKED` для очередей задач
- [ ] `FOR UPDATE` для атомарных операций с балансами/счётчиками
- [ ] Не использовать session-level locks с PgBouncer
- [ ] Timeout для избежания дедлоков (`lock_timeout`)
