---
name: postgresql-optimizer
description: "Оптимизация PostgreSQL запросов: EXPLAIN ANALYZE, индексы, N+1, партиционирование, connection pooling, slow query log. Use when: медленные запросы, оптимизация БД, EXPLAIN, индексы, N+1 проблема, slow query."
argument-hint: "[таблица или запрос для анализа]"
---

# PostgreSQL Optimizer — Оптимизация запросов

---

## Диагностика медленных запросов

```sql
-- Топ-10 медленных запросов (pg_stat_statements должен быть включён)
SELECT
  LEFT(query, 100) AS query_short,
  calls,
  ROUND((total_exec_time / calls)::numeric, 2) AS avg_ms,
  ROUND(total_exec_time::numeric, 0) AS total_ms,
  rows / NULLIF(calls, 0) AS avg_rows
FROM pg_stat_statements
WHERE calls > 10
ORDER BY avg_ms DESC
LIMIT 10;

-- EXPLAIN ANALYZE для конкретного запроса
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM messages
WHERE channel_id = 'uuid'
ORDER BY created_at DESC
LIMIT 50;
-- Ищем: Seq Scan (плохо) vs Index Scan (хорошо)
-- Ищем: rows=<большое число> при маленьком limit

-- Запросы без индексов (sequential scans на больших таблицах)
SELECT schemaname, tablename, seq_scan, idx_scan, n_live_tup
FROM pg_stat_user_tables
WHERE seq_scan > idx_scan AND n_live_tup > 1000
ORDER BY seq_scan DESC;
```

---

## Индексы — когда и какие

```sql
-- Базовые индексы для мессенджера
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_channel_created
  ON messages(channel_id, created_at DESC);  -- Сортировка по времени в канале

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_sender
  ON messages(sender_id, created_at DESC);  -- Сообщения пользователя

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_channel_members_user
  ON channel_members(user_id, channel_id);  -- Каналы пользователя

-- Partial index (только для активных/непрочитанных)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_unread
  ON messages(channel_id, created_at)
  WHERE is_deleted = FALSE;  -- Исключаем удалённые

-- GIN индекс для полнотекстового поиска
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_fts
  ON messages USING gin(to_tsvector('russian', content));
```

---

## N+1 проблема

```typescript
// ❌ N+1: один запрос на пользователя
const messages = await getMessages(channelId); // 1 запрос
for (const msg of messages) {
  msg.sender = await getProfile(msg.sender_id); // N запросов!
}

// ✅ JOIN: один запрос
const { data } = await supabase
  .from('messages')
  .select(`
    id, content, created_at,
    sender:profiles!sender_id(id, display_name, avatar_url)
  `)
  .eq('channel_id', channelId)
  .order('created_at', { ascending: false })
  .limit(50);
```

---

## Connection Pooling (Supabase)

```typescript
// Supabase автоматически использует PgBouncer в transaction mode
// НО: некоторые вещи не работают в transaction mode:

// ❌ НЕ работает c PgBouncer transaction mode:
// - SET LOCAL
// - PREPARE/EXECUTE
// - advisory locks (pg_advisory_lock)
// - LISTEN/NOTIFY (использовать Realtime вместо этого)

// ✅ Используем правильный URL для ORM:
// Session mode (прямое подключение) — для миграций, DDL
// Transaction mode (PgBouncer) — для обычных запросов
const sessionUrl = process.env.SUPABASE_DB_URL!; // Port 5432 — session mode
const poolUrl = process.env.SUPABASE_DB_POOL_URL!; // Port 6543 — transaction mode
```

---

## Оптимизация Supabase запросов

```typescript
// Всегда указывать нужные поля (не SELECT *)
const { data } = await supabase
  .from('messages')
  .select('id, content, created_at, sender_id') // Только нужные поля
  .limit(50); // ОБЯЗАТЕЛЬНО

// Range запросы эффективнее count()
const { data, count } = await supabase
  .from('messages')
  .select('id, created_at', { count: 'estimated' }) // estimated быстрее exact
  .range(0, 49);
```

---

## Чеклист

- [ ] EXPLAIN ANALYZE на запросы >10ms
- [ ] Composite индекс для часто используемых WHERE + ORDER BY
- [ ] Нет N+1 запросов (JOIN или batch loading)
- [ ] `.limit()` на всех списковых запросах (обязательно!)
- [ ] SELECT только нужных полей (не SELECT *)
- [ ] Partial indexes для активных записей
- [ ] `count: 'estimated'` вместо 'exact' для pagination
