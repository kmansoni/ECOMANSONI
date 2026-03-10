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
    c.column_name = 'user_id'
    OR c.column_name = 'sender_id'
    OR c.column_name = 'created_by'
    OR c.column_name = 'owner_id'
    OR c.column_name = 'actor_id'
    OR c.column_name = 'recipient_id'
  )
ORDER BY c.table_name, c.column_name;