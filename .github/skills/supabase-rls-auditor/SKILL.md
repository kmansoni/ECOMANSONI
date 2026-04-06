# Supabase RLS Auditor

## Описание

Аудит Row Level Security на всех таблицах проекта. Проверка покрытия, тестирование bypass, генерация отчёта.

## Когда использовать

- Добавлена новая таблица
- Изменена RLS-политика
- Перед релизом — полный аудит
- После обнаружения уязвимости

## Чеклист аудита

1. **Покрытие** — каждая таблица имеет `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
2. **Политики** — SELECT / INSERT / UPDATE / DELETE покрыты отдельно
3. **Service role bypass** — убедиться что service_role НЕ используется на клиенте
4. **Anon доступ** — только публичные данные доступны для `anon`
5. **auth.uid()** — каждая политика привязана к `auth.uid()` или роли
6. **JOIN leaks** — нет утечки через связанные таблицы без RLS
7. **Functions** — `SECURITY DEFINER` функции не обходят RLS случайно

## Проверка покрытия — SQL

```sql
-- Таблицы БЕЗ RLS (критично)
SELECT schemaname, tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN (
    SELECT tablename FROM pg_tables t
    JOIN pg_class c ON c.relname = t.tablename
    WHERE c.relrowsecurity = true
  );

-- Таблицы с RLS но БЕЗ политик (бесполезно — блокирует всё)
SELECT c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relrowsecurity = true
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname
  );
```

## Тестирование bypass

```sql
-- Тест: anon НЕ видит чужие данные
SET role anon;
SET request.jwt.claims = '{"sub": "user-1"}';
SELECT count(*) FROM messages WHERE sender_id != 'user-1';
-- Ожидание: 0 строк
RESET role;

-- Тест: authenticated видит только свои
SET role authenticated;
SET request.jwt.claims = '{"sub": "user-1"}';
SELECT * FROM profiles WHERE id != 'user-1';
-- Ожидание: только публичные поля или 0 строк
RESET role;
```

## Шаблон политики

```sql
-- Стандартная owner-based политика
DO $$ BEGIN
  CREATE POLICY "users_own_data" ON public.user_settings
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

## Формат отчёта

```
RLS AUDIT REPORT
================
Таблиц всего:        42
С RLS:                40
Без RLS:              2  [CRITICAL] orders_temp, debug_log
С политиками:         38
RLS без политик:      2  [WARNING]  analytics_raw, export_queue
Bypass тестов:        15 passed, 0 failed
```

## Anti-patterns

- `CREATE POLICY ... USING (true)` — открывает таблицу всем
- RLS на таблице без единой политики — блокирует ВСЁ включая service
- `SECURITY DEFINER` функция с `SELECT *` без фильтра — обход RLS
- Проверка RLS только для SELECT, забыли DELETE
- `WITH CHECK` отсутствует — INSERT/UPDATE без ограничений
- Тестирование RLS только под `service_role` — ничего не проверяет

## Периодичность

- При каждой миграции с новой таблицей
- Еженедельно — автоматический скрипт покрытия
- Перед каждым production-релизом — полный аудит
