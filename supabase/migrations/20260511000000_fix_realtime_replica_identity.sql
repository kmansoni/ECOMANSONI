-- =============================================================================
-- REPLICA IDENTITY FIX для Realtime
-- =============================================================================
-- ПРОБЛЕМА: Realtime events для DELETE/UPDATE на таблице messages НЕ содержат
--           payload (payload.new / payload.old) потому что REPLICA IDENTITY не
--           установлен. Supabase Realtime использует WAL (Write-Ahead Logging),
--           и для получения данных об удалённых/изменённых строках нужен REPLICA IDENTITY.
--
-- ПОСЛЕДСТВИЯ БЕЗ ЭТОГО ФИКСА:
-- - DELETE events не содержат id удалённого сообщения
-- - UPDATE events не содержат обновлённые данные
-- - Realtime подписка на messages.filter() не работает корректно
-- - Клиент не получает уведомления о новых сообщениях
--
-- РЕШЕНИЕ: ALTER TABLE messages REPLICA IDENTITY USING messages(id);
-- Это устанавливает PRIMARY KEY (id) как REPLICA IDENTITY,
-- что позволяет Postgres передавать id в WAL для всех событий.
-- =============================================================================

-- Проверяем текущее состояние REPLICA IDENTITY
DO $$
DECLARE
    ri_text TEXT;
BEGIN
    SELECT relreplident INTO ri_text
    FROM pg_class
    WHERE relname = 'messages'
      AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

    RAISE NOTICE 'Current REPLICA IDENTITY for messages: %', ri_text;
    -- d = default (первичный ключ), n = nothing, a = all columns, i = indexed column
END $$;

-- Устанавливаем REPLICA IDENTITY на PRIMARY KEY (id)
-- Это необходимо для Supabase Realtime чтобы получать payload в DELETE/UPDATE событиях
ALTER TABLE public.messages REPLICA IDENTITY USING INDEX messages_pkey;

-- Также проверим и установим для conversation_participants (если ещё не установлено)
DO $$
DECLARE
    ri_text TEXT;
BEGIN
    SELECT relreplident INTO ri_text
    FROM pg_class
    WHERE relname = 'conversation_participants'
      AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

    RAISE NOTICE 'Current REPLICA IDENTITY for conversation_participants: %', ri_text;
END $$;

-- Для conversation_participants тоже нужен REPLICA IDENTITY
-- Подписка на conversation_participants используется для обновления списка чатов
ALTER TABLE public.conversation_participants REPLICA IDENTITY USING INDEX conversation_participants_pkey;

-- =============================================================================
-- ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА: publication membership
-- =============================================================================
-- Убеждаемся что все критичные таблицы в supabase_realtime publication

DO $$
DECLARE
    tbl TEXT;
    pub_exists BOOLEAN;
BEGIN
    -- Проверяем наличие publication
    SELECT EXISTS(
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) INTO pub_exists;

    IF pub_exists THEN
        RAISE NOTICE 'Publication supabase_realtime exists';

        -- Проверяем tables в publication
        FOR tbl IN
            SELECT relname
            FROM pg_class c
            JOIN pg_publication_tables pt ON pt.tablename = c.relname
            WHERE pt.pubname = 'supabase_realtime'
              AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        LOOP
            RAISE NOTICE 'Table % is in supabase_realtime', tbl;
        END LOOP;
    ELSE
        RAISE WARNING 'Publication supabase_realtime NOT FOUND';
    END IF;
END $$;

-- =============================================================================
-- ЛОГИРОВАНИЕ: записываем в лог что фикс применён
-- =============================================================================
RAISE NOTICE 'REPLICA IDENTITY fix applied for messages and conversation_participants';
