---
description: "Правила для SQL миграций Supabase. Use when: создание миграции, ALTER TABLE, CREATE TABLE, CREATE INDEX, RLS policy, trigger, function."
applyTo: "supabase/migrations/**/*.sql"
---

# Миграции Supabase

## Обязательные правила

1. **RLS на КАЖДОЙ таблице** — сразу после CREATE TABLE
2. **IF NOT EXISTS** только на ALTER TABLE ADD COLUMN (не на CREATE TABLE!)
3. **БЕЗ CONCURRENTLY** на CREATE INDEX (Supabase Management API = transaction)
4. **Именование**: `YYYYMMDDHHMMSS_описание.sql`
5. **Только additive** — никогда DROP COLUMN в одном релизе с удалением кода
6. **Раздельные DDL и DML** — ALTER TABLE и INSERT в разных миграциях
7. **SECURITY DEFINER** для функций, вызываемых из RLS

## Шаблон

```sql
-- Таблица (ВНИМАНИЕ: БЕЗ IF NOT EXISTS!)
CREATE TABLE my_table (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  -- ...
);

-- Индексы (ВНИМАНИЕ: БЕЗ CONCURRENTLY!)
CREATE INDEX idx_my_table_user ON my_table(user_id);

-- RLS (ОБЯЗАТЕЛЬНО)
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own" ON my_table
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "users_insert_own" ON my_table
  FOR INSERT WITH CHECK (user_id = auth.uid());
```

## ⚠️ ЖЁСТКИЕ ЗАПРЕТЫ

```
❌ НИКОГДА: CREATE TABLE IF NOT EXISTS
   → Пропустит создание, RLS не применится

❌ НИКОГДА: CREATE INDEX CONCURRENTLY
   → Supabase Management API = transaction, CONCURRENTLY не поддерживается

❌ НИКОГДА: DROP TABLE/COLUMN в одном релизе с удалением кода

❌ НИКОГДА: RENAME в production без blue-green

✅ IF NOT EXISTS только для: ALTER TABLE ADD COLUMN
✅ Всегда: RLS policies в той же миграции что и CREATE TABLE
```
