SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('conversations','conversation_state','chat_inbox_projection')
ORDER BY table_name, ordinal_position;