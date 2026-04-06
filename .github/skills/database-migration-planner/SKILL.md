---
name: database-migration-planner
description: "Планирование безопасных database migrations: additive-only стратегия, multi-step migrations, rollback plan, zero-downtime. Use when: планирование миграции, breaking migration, rename column, drop column, zero downtime migration."
argument-hint: "[тип изменения: rename | drop | add | refactor]"
---

# Database Migration Planner — Безопасные миграции

Главный принцип: **только additive изменения** в одном релизе с удалением кода.

---

## Запрещённые операции в проекте

```sql
-- ❌ НИКОГДА в одном релизе с удалением кода:
DROP COLUMN users.old_field;        -- Сначала убрать из кода, потом удалить
DROP TABLE old_table;               -- Только после полного отключения
ALTER TABLE messages RENAME COLUMN text TO content; -- Breaking change для клиентов

-- ❌ Опасные в production:
CREATE INDEX ... CONCURRENTLY;      -- Management API не поддерживает (использовать без CONCURRENTLY)
ALTER TABLE ADD CONSTRAINT ... FOREIGN KEY ... DEFERRABLE; -- Блокировка таблицы
```

---

## Multi-step паттерн для rename column

```
Шаг 1 (Релиз N): Добавить новую колонку, написать в обе
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS body TEXT;
  UPDATE messages SET body = content WHERE body IS NULL;
  -- Триггер синхронизации: INSERT/UPDATE в одну → обновляет другую

Шаг 2 (Релиз N+1): Читать из новой колонки
  -- Код переключается на новое имя
  -- Обе колонки синхронизированы

Шаг 3 (Релиз N+2): Удалить старую колонку
  ALTER TABLE messages DROP COLUMN content;
  -- Теперь безопасно
```

---

## Безопасный шаблон миграции

```sql
-- Заголовок каждой миграции
-- Формат: YYYYMMDDHHMMSS_description.sql
-- Пример: 20240315120000_add_reactions_table.sql

-- Проверка предусловий (не CREATE IF NOT EXISTS — использовать явные проверки)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages') THEN
    RAISE EXCEPTION 'messages table does not exist!';
  END IF;
END $$;

-- Additive операции (безопасны)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reactions_count INTEGER DEFAULT 0;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;

-- Индексы (без CONCURRENTLY в Management API)
CREATE INDEX IF NOT EXISTS idx_messages_pinned
  ON messages(channel_id)
  WHERE is_pinned = TRUE;

-- RLS policy (идемпотентная)
DO $$ BEGIN
  CREATE POLICY "messages_reactions_read"
    ON messages FOR SELECT
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

---

## Rollback стратегия

```sql
-- Каждая миграция должна иметь reverse операцию (в виде нотации)
-- Прямая:
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;

-- Обратная (хранить в комментарии или отдельном файле):
-- ROLLBACK: ALTER TABLE profiles DROP COLUMN IF EXISTS bio;

-- Для больших изменений: feature flag вместо прямой миграции
-- 1. Мигрировать данные с новой схемой
-- 2. Флаг: use_new_schema = false
-- 3. Постепенно включать флаг для пользователей
-- 4. После 100% — убрать флаг и старый код
```

---

## Проверка перед деплоем

```bash
# Проверить все pending миграции
supabase db diff --linked

# Dry run миграции
supabase db push --dry-run

# Проверить что миграция не использует запрещённые паттерны
grep -rn "RENAME COLUMN\|DROP COLUMN\|DROP TABLE\|CONCURRENTLY" supabase/migrations/ \
  | grep -v "-- ROLLBACK\|-- SAFE"

# Проверить наличие IF NOT EXISTS / IF EXISTS
grep -n "ALTER TABLE.*ADD\|CREATE.*TABLE\|CREATE.*INDEX" supabase/migrations/*.sql \
  | grep -v "IF NOT EXISTS\|IF EXISTS"
```

---

## Чеклист

- [ ] Только additive изменения (ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS)
- [ ] Нет RENAME/DROP в одном релизе с изменением кода
- [ ] Нет CONCURRENTLY (Management API ограничение)
- [ ] Индексы с IF NOT EXISTS
- [ ] RLS policies в DO $$ BEGIN...EXCEPTION WHEN duplicate_object THEN NULL; END $$
- [ ] Rollback план задокументирован
- [ ] Dry run перед деплоем
