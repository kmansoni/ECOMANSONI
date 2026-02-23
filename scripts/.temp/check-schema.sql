SELECT 
  'get_or_create_dm(uuid)' AS check_name,
  EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_or_create_dm'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid'
  ) AS exists
UNION ALL
SELECT 
  'get_or_create_dm(target_user_id uuid)' AS check_name,
  EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_or_create_dm'
      AND pg_get_function_identity_arguments(p.oid) = 'target_user_id uuid'
  ) AS exists
UNION ALL
SELECT 
  'send_message_v1' AS check_name,
  EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'send_message_v1'
  ) AS exists
UNION ALL
SELECT 
  'dm_pairs table' AS check_name,
  EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'dm_pairs'
  ) AS exists
UNION ALL
SELECT 
  'messages.seq column' AS check_name,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'messages'
      AND column_name = 'seq'
  ) AS exists;
