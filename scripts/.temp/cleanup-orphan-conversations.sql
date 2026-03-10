WITH orphan_conversations AS (
  SELECT c.id
  FROM public.conversations c
  LEFT JOIN public.conversation_participants cp
    ON cp.conversation_id = c.id
  GROUP BY c.id
  HAVING COUNT(cp.*) = 0
),
bot_conversations_deleted AS (
  DELETE FROM public.bot_conversations t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
calls_deleted AS (
  DELETE FROM public.calls t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
chat_encryption_keys_deleted AS (
  DELETE FROM public.chat_encryption_keys t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
conversation_cursors_deleted AS (
  DELETE FROM public.conversation_cursors t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
conversation_pins_deleted AS (
  DELETE FROM public.conversation_pins t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
conversation_state_deleted AS (
  DELETE FROM public.conversation_state t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
dm_pairs_deleted AS (
  DELETE FROM public.dm_pairs t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
join_requests_deleted AS (
  DELETE FROM public.join_requests t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
message_polls_deleted AS (
  DELETE FROM public.message_polls t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
message_reminders_deleted AS (
  DELETE FROM public.message_reminders t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
message_threads_deleted AS (
  DELETE FROM public.message_threads t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
message_versions_deleted AS (
  DELETE FROM public.message_versions t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
messages_deleted AS (
  DELETE FROM public.messages t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
pinned_messages_deleted AS (
  DELETE FROM public.pinned_messages t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
saved_messages_deleted AS (
  DELETE FROM public.saved_messages t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
scheduled_messages_deleted AS (
  DELETE FROM public.scheduled_messages t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
secret_chats_deleted AS (
  DELETE FROM public.secret_chats t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
sent_gifts_deleted AS (
  DELETE FROM public.sent_gifts t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
supergroup_settings_deleted AS (
  DELETE FROM public.supergroup_settings t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
thread_read_positions_deleted AS (
  DELETE FROM public.thread_read_positions t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
user_chat_settings_deleted AS (
  DELETE FROM public.user_chat_settings t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
user_encryption_keys_deleted AS (
  DELETE FROM public.user_encryption_keys t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
vanish_mode_sessions_deleted AS (
  DELETE FROM public.vanish_mode_sessions t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
video_calls_deleted AS (
  DELETE FROM public.video_calls t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
voice_messages_deleted AS (
  DELETE FROM public.voice_messages t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
conversation_participants_deleted AS (
  DELETE FROM public.conversation_participants t
  WHERE t.conversation_id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
),
conversations_deleted AS (
  DELETE FROM public.conversations t
  WHERE t.id IN (SELECT id FROM orphan_conversations)
  RETURNING 1
)
SELECT 'orphan_conversations_found' AS target, COUNT(*) AS affected_rows FROM orphan_conversations
UNION ALL SELECT 'bot_conversations', COUNT(*) FROM bot_conversations_deleted
UNION ALL SELECT 'calls', COUNT(*) FROM calls_deleted
UNION ALL SELECT 'chat_encryption_keys', COUNT(*) FROM chat_encryption_keys_deleted
UNION ALL SELECT 'conversation_cursors', COUNT(*) FROM conversation_cursors_deleted
UNION ALL SELECT 'conversation_pins', COUNT(*) FROM conversation_pins_deleted
UNION ALL SELECT 'conversation_state', COUNT(*) FROM conversation_state_deleted
UNION ALL SELECT 'dm_pairs', COUNT(*) FROM dm_pairs_deleted
UNION ALL SELECT 'join_requests', COUNT(*) FROM join_requests_deleted
UNION ALL SELECT 'message_polls', COUNT(*) FROM message_polls_deleted
UNION ALL SELECT 'message_reminders', COUNT(*) FROM message_reminders_deleted
UNION ALL SELECT 'message_threads', COUNT(*) FROM message_threads_deleted
UNION ALL SELECT 'message_versions', COUNT(*) FROM message_versions_deleted
UNION ALL SELECT 'messages', COUNT(*) FROM messages_deleted
UNION ALL SELECT 'pinned_messages', COUNT(*) FROM pinned_messages_deleted
UNION ALL SELECT 'saved_messages', COUNT(*) FROM saved_messages_deleted
UNION ALL SELECT 'scheduled_messages', COUNT(*) FROM scheduled_messages_deleted
UNION ALL SELECT 'secret_chats', COUNT(*) FROM secret_chats_deleted
UNION ALL SELECT 'sent_gifts', COUNT(*) FROM sent_gifts_deleted
UNION ALL SELECT 'supergroup_settings', COUNT(*) FROM supergroup_settings_deleted
UNION ALL SELECT 'thread_read_positions', COUNT(*) FROM thread_read_positions_deleted
UNION ALL SELECT 'user_chat_settings', COUNT(*) FROM user_chat_settings_deleted
UNION ALL SELECT 'user_encryption_keys', COUNT(*) FROM user_encryption_keys_deleted
UNION ALL SELECT 'vanish_mode_sessions', COUNT(*) FROM vanish_mode_sessions_deleted
UNION ALL SELECT 'video_calls', COUNT(*) FROM video_calls_deleted
UNION ALL SELECT 'voice_messages', COUNT(*) FROM voice_messages_deleted
UNION ALL SELECT 'conversation_participants', COUNT(*) FROM conversation_participants_deleted
UNION ALL SELECT 'conversations', COUNT(*) FROM conversations_deleted
ORDER BY target;