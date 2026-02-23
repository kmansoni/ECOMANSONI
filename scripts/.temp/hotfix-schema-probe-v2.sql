-- HOTFIX: chat_schema_probe_v2 - fix function signature check
-- 
-- Problem: probe checks for get_or_create_dm(uuid) but actual signature is get_or_create_dm(target_user_id uuid)
-- Fix: Check for named parameter syntax

CREATE OR REPLACE FUNCTION public.chat_schema_probe_v2()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  has_get_or_create_dm BOOLEAN := FALSE;
  has_send_message_v1 BOOLEAN := FALSE;
  has_dm_uniqueness BOOLEAN := FALSE;
  has_seq_column BOOLEAN := FALSE;
  rls_messages BOOLEAN := FALSE;
  rls_participants BOOLEAN := FALSE;
  required_objects_present BOOLEAN := FALSE;
BEGIN
  -- Functions exist? (check for named parameter)
  has_get_or_create_dm := EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_or_create_dm'
      AND (
        pg_get_function_identity_arguments(p.oid) = 'uuid'
        OR pg_get_function_identity_arguments(p.oid) = 'target_user_id uuid'
      )
  );

  has_send_message_v1 := EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'send_message_v1'
      AND pg_get_function_identity_arguments(p.oid) LIKE '%uuid%text%'
  );

  -- DM uniqueness mechanism present?
  has_dm_uniqueness := EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'dm_pairs'
  );

  -- messages.seq exists?
  has_seq_column := EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'messages'
      AND column_name = 'seq'
  );

  -- RLS enabled?
  rls_messages := EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'messages'
      AND c.relrowsecurity = true
  );

  rls_participants := EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'conversation_participants'
      AND c.relrowsecurity = true
  );

  required_objects_present := (
    has_get_or_create_dm
    AND has_send_message_v1
    AND has_dm_uniqueness
    AND has_seq_column
    AND rls_messages
    AND rls_participants
  );

  RETURN jsonb_build_object(
    'ok', required_objects_present,
    'schema_version', 2,
    'required_objects_present', required_objects_present,
    'has_get_or_create_dm', has_get_or_create_dm,
    'has_send_message_v1', has_send_message_v1,
    'has_dm_uniqueness', has_dm_uniqueness,
    'has_seq_column', has_seq_column,
    'rls_messages', rls_messages,
    'rls_participants', rls_participants,
    'server_time', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.chat_schema_probe_v2() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_schema_probe_v2() TO authenticated;
