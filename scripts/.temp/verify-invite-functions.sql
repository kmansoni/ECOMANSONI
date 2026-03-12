SELECT
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS function_def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('join_channel_by_invite', 'join_group_by_invite')
ORDER BY p.proname;
