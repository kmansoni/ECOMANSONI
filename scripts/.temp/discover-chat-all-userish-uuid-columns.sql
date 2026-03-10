SELECT
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND (
    c.table_name LIKE 'conversation%'
    OR c.table_name LIKE 'chat%'
    OR c.table_name = 'messages'
  )
  AND c.data_type = 'uuid'
  AND (
    c.column_name LIKE '%user%'
    OR c.column_name LIKE '%sender%'
    OR c.column_name LIKE '%recipient%'
    OR c.column_name LIKE '%actor%'
    OR c.column_name LIKE '%author%'
    OR c.column_name LIKE '%owner%'
    OR c.column_name LIKE '%from%'
    OR c.column_name LIKE '%to%'
    OR c.column_name LIKE '%peer%'
    OR c.column_name LIKE '%participant%'
  )
ORDER BY c.table_name, c.column_name;