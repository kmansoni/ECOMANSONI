---
description: "Правила для SQL миграций Supabase. Use when: создание миграции, ALTER TABLE, CREATE TABLE, CREATE INDEX, RLS policy, trigger, function."
applyTo: "supabase/migrations/**/*.sql"
---

# Миграции Supabase

## Обязательные правила

1. **RLS на КАЖДОЙ таблице** — сразу после CREATE TABLE
2. **IF NOT EXISTS** на всех CREATE (TABLE, INDEX, FUNCTION)
3. **CONCURRENTLY** на всех CREATE INDEX (кроме внутри транзакции)
4. **Именование**: `YYYYMMDDHHMMSS_описание.sql`
5. **Только additive** — никогда DROP COLUMN в одном релизе с удалением кода
6. **Раздельные DDL и DML** — ALTER TABLE и INSERT в разных миграциях
7. **SECURITY DEFINER** для функций, вызываемых из RLS

## Шаблон

```sql
-- Таблица
CREATE TABLE IF NOT EXISTS my_table (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  -- ...
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_my_table_user ON my_table(user_id);

-- RLS (ОБЯЗАТЕЛЬНО)
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own" ON my_table
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "users_insert_own" ON my_table
  FOR INSERT WITH CHECK (user_id = auth.uid());
```
