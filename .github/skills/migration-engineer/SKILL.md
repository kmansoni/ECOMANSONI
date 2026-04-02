---
name: migration-engineer
description: "Агент миграций и БД: генерация полных SQL, rollback, schema diff, data migration, EXPLAIN ANALYZE → индексы, vacuum, partitioning, FK cascade analysis. Use when: миграция, ALTER TABLE, CREATE TABLE, rollback, schema diff, backfill, индекс, EXPLAIN, vacuum, partition, FK cascade, нормализация, денормализация, база данных."
argument-hint: "[действие: generate | rollback | diff | optimize | analyze-table | full-audit]"
user-invocable: true
---

# Migration Engineer — Агент миграций и БД

Полная экспертиза по управлению SQL миграциями, оптимизации запросов, стратегиям rollback, partitioning и data migration для PostgreSQL на Supabase. Каждая миграция генерируется с RLS, индексами, триггерами и тестами.

## Принцип

> Миграция — необратимая операция на живой БД. Каждый ALTER TABLE может заблокировать таблицу. Каждый DROP может уничтожить данные. Поэтому: additive-only, CONCURRENTLY для индексов, тесты RLS, rollback план ДО деплоя.

---

## 1. Генератор полных миграций

### 1.1. Протокол создания таблицы

```
Для каждой новой таблицы — ОБЯЗАТЕЛЬНО:
1. CREATE TABLE с constraints (CHECK, NOT NULL, DEFAULT, REFERENCES)
2. Indexes (B-tree для FK, GIN для полнотекстового, GIST для geo)
3. Trigger: updated_at auto-update
4. RLS: ENABLE + политики для SELECT/INSERT/UPDATE/DELETE
5. Comment: описание таблицы и полей
6. Тестовые данные: не включать в миграцию (отдельным seed)
```

### 1.2. Полный шаблон миграции

```sql
-- =============================================================================
-- Миграция: {YYYYMMDDHHMMSS}_{описание}.sql
-- Описание: {что делает эта миграция}
-- Rollback: {описание отката}
-- =============================================================================

-- Timeout для безопасности
SET statement_timeout = '30s';
SET lock_timeout = '5s';

-- =============================================================================
-- 1. Создание таблицы
-- =============================================================================

CREATE TABLE IF NOT EXISTS {entities} (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Бизнес-поля с constraints
  title text NOT NULL 
    CHECK (char_length(title) BETWEEN 1 AND 500),
  description text 
    CHECK (description IS NULL OR char_length(description) <= 5000),
  status text NOT NULL DEFAULT 'draft' 
    CHECK (status IN ('draft', 'active', 'completed', 'cancelled', 'deleted')),
  
  -- Числовые с ranges
  amount numeric(12,2) 
    CHECK (amount IS NULL OR amount >= 0),
  
  -- JSON для расширяемости
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Комментарии
COMMENT ON TABLE {entities} IS '{Описание таблицы}';
COMMENT ON COLUMN {entities}.status IS 'Статус: draft → active → completed/cancelled';

-- =============================================================================
-- 2. Индексы (CONCURRENTLY для zero-downtime)
-- =============================================================================

-- FK индексы (ОБЯЗАТЕЛЬНО для каждого FK)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_{entities}_user_id 
  ON {entities}(user_id);

-- Status фильтр (partial index — только активные)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_{entities}_active 
  ON {entities}(created_at DESC) WHERE status = 'active';

-- Composite index для типичного запроса
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_{entities}_user_status 
  ON {entities}(user_id, status, created_at DESC);

-- Полнотекстовый поиск (если нужен)
-- ALTER TABLE {entities} ADD COLUMN IF NOT EXISTS search_vector tsvector
--   GENERATED ALWAYS AS (
--     setweight(to_tsvector('russian', coalesce(title, '')), 'A') ||
--     setweight(to_tsvector('russian', coalesce(description, '')), 'B')
--   ) STORED;
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_{entities}_search 
--   ON {entities} USING GIN(search_vector);

-- Geo поиск (если нужен)
-- ALTER TABLE {entities} ADD COLUMN IF NOT EXISTS location geography(POINT);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_{entities}_location 
--   ON {entities} USING GIST(location);

-- =============================================================================
-- 3. Trigger: updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_{entities}_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_{entities}_updated_at ON {entities};
CREATE TRIGGER trg_{entities}_updated_at
  BEFORE UPDATE ON {entities}
  FOR EACH ROW EXECUTE FUNCTION update_{entities}_updated_at();

-- =============================================================================
-- 4. RLS
-- =============================================================================

ALTER TABLE {entities} ENABLE ROW LEVEL SECURITY;

-- SELECT: владелец видит свои
CREATE POLICY "{entities}_select_own" ON {entities}
  FOR SELECT USING (user_id = auth.uid());

-- INSERT: auth.uid() = user_id
CREATE POLICY "{entities}_insert_own" ON {entities}
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- UPDATE: только владелец, проверка и USING и WITH CHECK
CREATE POLICY "{entities}_update_own" ON {entities}
  FOR UPDATE 
  USING (user_id = auth.uid()) 
  WITH CHECK (user_id = auth.uid());

-- DELETE: только владелец
CREATE POLICY "{entities}_delete_own" ON {entities}
  FOR DELETE USING (user_id = auth.uid());

-- =============================================================================
-- 5. Helper functions (если нужны для RLS других таблиц)
-- =============================================================================

-- Проверка участия в сущности (для дочерних таблиц)
CREATE OR REPLACE FUNCTION is_{entity}_owner(p_{entity}_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM {entities}
    WHERE id = p_{entity}_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Сбросить timeout
RESET statement_timeout;
RESET lock_timeout;
```

---

## 2. Rollback Strategy

### 2.1. Правило: Additive-Only

```
НИКОГДА в одном релизе:
  ❌ DROP COLUMN + удаление кода, который его використовував
  ❌ ALTER TYPE (может привести к exclusive lock)
  ❌ DROP TABLE (если есть FK)

Безопасная последовательность для удаления column:
  Релиз 1: Убрать код, который ПИШЕТ в column
  Релиз 2: Убрать код, который ЧИТАЕТ из column
  Релиз 3: ALTER TABLE DROP COLUMN (через ≥ 1 неделю)
```

### 2.2. Rollback для каждого типа операции

```sql
-- CREATE TABLE → DROP TABLE
-- Rollback:
DROP TABLE IF EXISTS {entities} CASCADE;

-- ADD COLUMN → DROP COLUMN
-- Rollback:
ALTER TABLE {entities} DROP COLUMN IF EXISTS new_column;

-- ADD INDEX → DROP INDEX
-- Rollback:
DROP INDEX CONCURRENTLY IF EXISTS idx_name;

-- ADD POLICY → DROP POLICY
-- Rollback:
DROP POLICY IF EXISTS "policy_name" ON {table};

-- ADD TRIGGER → DROP TRIGGER
-- Rollback:
DROP TRIGGER IF EXISTS trg_name ON {table};

-- RENAME COLUMN → RENAME BACK
-- Rollback:
ALTER TABLE {table} RENAME COLUMN new_name TO old_name;
```

### 2.3. Blue-Green Migration

```
Для рискованных миграций:

Шаг 1: Создать новую таблицу (v2)
  CREATE TABLE {entities}_v2 (...);

Шаг 2: Двойная запись (write to both)
  Trigger на v1: INSERT → also insert into v2
  Код пишет в v1 (существующий flow)

Шаг 3: Backfill v2 из v1
  INSERT INTO {entities}_v2 SELECT ... FROM {entities} WHERE NOT EXISTS (...)

Шаг 4: Переключить чтение на v2
  Код читает из v2

Шаг 5: Переключить запись на v2
  Удалить trigger, код пишет только в v2

Шаг 6: Drop v1 (через неделю)
  DROP TABLE {entities};
  ALTER TABLE {entities}_v2 RENAME TO {entities};
```

---

## 3. Schema Diff Tool

### 3.1. Протокол определения расхождений

```sql
-- Получить текущую схему (из БД):
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default,
  character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- Получить индексы:
SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public';

-- Получить RLS статус:
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- Получить политики:
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public';

-- Получить триггеры:
SELECT trigger_name, event_object_table, action_timing, event_manipulation
FROM information_schema.triggers WHERE trigger_schema = 'public';
```

### 3.2. Сравнение: Миграции vs Реальная схема

```
Протокол:
1. Прочитать ВСЕ миграции (supabase/migrations/*.sql)
2. Построить "ожидаемую" схему из миграций
3. Получить "актуальную" схему из БД (SQL выше)
4. Сравнить:
   ☐ Таблицы: есть ли в миграциях, но нет в БД?
   ☐ Columns: типы, nullable, default — совпадают?
   ☐ Indexes: все создались?
   ☐ RLS: включён на всех таблицах?
   ☐ Policies: все применились?
   ☐ Triggers: все на месте?
5. Записать diff в отчёт
```

### 3.3. TypeScript types vs Schema

```
Протокол:
1. Прочитать src/lib/**/types.ts
2. Для каждого interface/type:
   → Проверить: совпадают ли поля с таблицей
   → Проверить: правильные ли типы (uuid = string, numeric = number, timestamptz = string)
   → Проверить: nullable vs optional
3. Если используется supabase-js codegen:
   → npx supabase gen types typescript > src/lib/database.types.ts
   → Сравнить с ручными типами
```

---

## 4. Data Migration Patterns

### 4.1. Backfill (заполнение нового column)

```sql
-- НЕПРАВИЛЬНО (блокирует таблицу):
UPDATE {table} SET new_col = compute(old_col);

-- ПРАВИЛЬНО (batch по 1000 строк):
DO $$
DECLARE
  batch_size int := 1000;
  last_id uuid := '00000000-0000-0000-0000-000000000000';
  rows_updated int;
BEGIN
  LOOP
    UPDATE {table}
    SET new_col = compute(old_col)
    WHERE id > last_id
      AND new_col IS NULL
      AND id IN (
        SELECT id FROM {table}
        WHERE id > last_id AND new_col IS NULL
        ORDER BY id LIMIT batch_size
      );
    
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
    
    SELECT max(id) INTO last_id FROM {table}
    WHERE id > last_id
    ORDER BY id LIMIT batch_size;
    
    -- Пауза для снижения нагрузки
    PERFORM pg_sleep(0.1);
  END LOOP;
END $$;
```

### 4.2. Zero-downtime column rename

```sql
-- Шаг 1: Добавить новый column
ALTER TABLE {table} ADD COLUMN new_name text;

-- Шаг 2: Backfill
UPDATE {table} SET new_name = old_name WHERE new_name IS NULL;

-- Шаг 3: Trigger для синхронизации во время перехода
CREATE OR REPLACE FUNCTION sync_{table}_rename()
RETURNS TRIGGER AS $$
BEGIN
  NEW.new_name = COALESCE(NEW.new_name, NEW.old_name);
  NEW.old_name = COALESCE(NEW.old_name, NEW.new_name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_rename BEFORE INSERT OR UPDATE ON {table}
  FOR EACH ROW EXECUTE FUNCTION sync_{table}_rename();

-- Шаг 4: Переключить код на new_name (deploy)
-- Шаг 5: Drop trigger + old column (через неделю)
```

---

## 5. Index Optimization

### 5.1. EXPLAIN ANALYZE → Рекомендации

```sql
-- Протокол:
-- 1. Собрать TOP 10 самых медленных запросов (pg_stat_statements)
SELECT 
  query,
  calls,
  mean_exec_time,
  total_exec_time,
  rows
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- 2. Для каждого: EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
-- 3. Анализ плана:

-- Seq Scan при > 10000 rows → НУЖЕН индекс
-- Index Scan (Forward) → OK
-- Bitmap Heap Scan → OK для multi-column conditions
-- Sort (cost > 1000) → Нужен индекс с ORDER BY
-- Nested Loop + Seq Scan → Нужен индекс на FK inner table
-- Hash Join → OK для large tables
-- Materialize → Subquery кэшируется, OK
```

### 5.2. Типы индексов

```
| Тип | Когда | Пример |
|-----|-------|--------|
| B-tree (default) | =, <, >, BETWEEN, ORDER BY | CREATE INDEX ON t(col) |
| GIN | Full-text search, JSONB, arrays | CREATE INDEX ON t USING GIN(search_vector) |
| GIST | Geometry, range types, nearest-neighbor | CREATE INDEX ON t USING GIST(location) |
| Hash | Только = (равенство) | Редко нужен, B-tree лучше |
| BRIN | Естественно упорядоченные данные | CREATE INDEX ON t USING BRIN(created_at) |
| Partial | Часто фильтруемое подмножество | CREATE INDEX ON t(col) WHERE active = true |
| Covering | Avoid heap fetch | CREATE INDEX ON t(a) INCLUDE (b, c) |
```

### 5.3. Индексные антипаттерны

```
❌ Индекс на column, который обновляется каждую секунду (bloat)
❌ Индекс на boolean column с 50/50 распределением (бесполезен)
❌ 10+ индексов на одной таблице (замедляет INSERT/UPDATE)
❌ Composite index (a, b, c) без использования prefix (a) в WHERE
❌ Дублирующиеся индексы (idx_a и idx_a_b — первый покрывается вторым)
❌ CREATE INDEX без CONCURRENTLY на production таблице
```

---

## 6. Vacuum & Bloat

### 6.1. Мониторинг bloat

```sql
-- Таблицы с высоким dead tuples:
SELECT
  relname as table_name,
  n_live_tup,
  n_dead_tup,
  round(n_dead_tup::numeric / GREATEST(n_live_tup, 1) * 100, 1) as dead_pct,
  last_vacuum,
  last_autovacuum
FROM pg_stat_all_tables
WHERE schemaname = 'public'
  AND n_live_tup > 1000
ORDER BY dead_pct DESC;

-- Правило: dead_pct > 20% → нужен VACUUM
-- Правило: dead_pct > 50% → нужен VACUUM FULL (ОСТОРОЖНО: exclusive lock!)
```

### 6.2. Autovacuum tuning

```sql
-- Для таблицы messages (высокий write throughput):
ALTER TABLE messages SET (
  autovacuum_vacuum_scale_factor = 0.05,    -- 5% dead tuples → vacuum (default 20%)
  autovacuum_analyze_scale_factor = 0.02,   -- 2% changes → analyze (default 10%)
  autovacuum_vacuum_cost_delay = 10         -- Менее агрессивный vacuum
);
```

---

## 7. Partitioning

### 7.1. Когда партиционировать

```
✅ Таблица > 10M строк
✅ Запросы ВСЕГДА фильтруют по partition key (date range, tenant_id)
✅ Старые данные можно архивировать (DROP PARTITION дешевле DELETE)

❌ Таблица < 1M строк — overhead больше пользы
❌ Запросы сканируют ВСЕ партиции — нет partition pruning
```

### 7.2. Range partitioning по дате

```sql
-- Messages: партиции по месяцам
CREATE TABLE messages (
  id uuid DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL,
  content text,
  created_at timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Партиции:
CREATE TABLE messages_2026_01 PARTITION OF messages
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE messages_2026_02 PARTITION OF messages
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- Автосоздание: cron job каждый месяц или pg_partman extension
```

---

## 8. FK Cascade Analysis

### 8.1. Аудит рисков CASCADE

```sql
-- Найти ВСЕ FK с CASCADE:
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  rc.delete_rule,
  rc.update_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name;

-- Правила:
-- ON DELETE CASCADE → безопасно для "part-of" (message → channel)
-- ON DELETE CASCADE → ОПАСНО для "associated-with" (user → profile → posts → comments)
--   → Удаление user = каскадное удаление ВСЕХ posts и comments!
--   → Лучше: ON DELETE SET NULL или soft delete
-- ON DELETE RESTRICT → безопасно, не даст удалить parent с children
```

### 8.2. Cascade depth analysis

```
Протокол:
1. Построить граф FK зависимостей
2. Для каждой таблицы: какова максимальная глубина CASCADE?
3. Depth > 3 → ОПАСНО (удаление user может удалить тысячи записей)
4. Рекомендация: soft delete (status = 'deleted') вместо CASCADE
```

---

## 9. Типичные миграции по доменам

```
| Домен | Таблицы | Особенности |
|-------|---------|-------------|
| Мессенджер | channels, channel_members, messages, reactions | sort_key BIGSERIAL, GIN для поиска, partition по дате |
| Знакомства | dating_profiles, swipes, matches | geography(POINT), GIN для interests, daily limits |
| Такси | rides, drivers, ride_routes | geography track, status machine, price numeric(10,2) |
| Маркетплейс | products, orders, order_items, reviews | full-text search, category tree (ltree), price index |
| CRM | contacts, deals, activities, pipelines | jsonb для custom fields, timeline view |
| Стриминг | streams, stream_chat, donations | HIGH write throughput, partition messages |
| Страхование | policies, claims, quotes | status machine, document storage FK |
| Недвижимость | properties, favorites, viewings | geography area, price range index, photo array |
```

---

## 10. Workflow

### Фаза 1: Анализ требований
1. Что меняется? (новая таблица / alter / data migration)
2. Есть ли зависимости? (FK, RLS, triggers, code)
3. Размер таблицы? (< 100K = simple, > 1M = careful)

### Фаза 2: Генерация миграции
1. Сгенерировать SQL по шаблону из секции 1
2. Включить: constraints, indexes, triggers, RLS
3. Написать rollback SQL

### Фаза 3: Проверка
1. Dry-run: `supabase db push --dry-run`
2. EXPLAIN ANALYZE для ключевых запросов ДО и ПОСЛЕ
3. RLS тесты (секция 3 из security-engineer)

### Фаза 4: Деплой
1. Бэкап перед деплоем
2. `supabase db push`
3. Мониторинг: statement_timeout, lock timeouts
4. Rollback план готов

### Фаза 5: Post-deploy
1. ANALYZE на новых таблицах
2. Проверить индексы: `pg_stat_user_indexes` (unused indexes?)
3. Обновить TypeScript types

---

## Маршрутизация в оркестраторе

**Триггеры**: миграция, CREATE TABLE, ALTER TABLE, DROP TABLE, индекс, index, EXPLAIN, query plan, rollback, backfill, data migration, vacuum, bloat, partition, FK cascade, schema diff, нормализация, денормализация, полнотекстовый поиск, full-text search, география, PostGIS, RLS политика

**Агенты**:
- `codesmith` — генерация и применение миграций
- `architect` — проектирование schema (при значительных изменениях)
- `review` — аудит миграций перед деплоем
