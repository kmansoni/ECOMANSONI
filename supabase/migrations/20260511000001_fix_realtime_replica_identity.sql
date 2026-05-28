-- =============================================================================
-- REPLICA IDENTITY FIX для Realtime
-- =============================================================================

DO $$
DECLARE
    ri_text TEXT;
BEGIN
    SELECT relreplident INTO ri_text
    FROM pg_class
    WHERE relname = 'messages'
      AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

    RAISE NOTICE 'Current REPLICA IDENTITY for messages: %', ri_text;
END $$;
ALTER TABLE public.messages REPLICA IDENTITY USING INDEX messages_pkey;
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
ALTER TABLE public.conversation_participants REPLICA IDENTITY USING INDEX conversation_participants_pkey;
DO $$
DECLARE
    tbl TEXT;
    pub_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) INTO pub_exists;

    IF pub_exists THEN
        RAISE NOTICE 'Publication supabase_realtime exists';

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
