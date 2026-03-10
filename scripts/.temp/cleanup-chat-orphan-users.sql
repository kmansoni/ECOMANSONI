WITH
chat_client_metrics_deleted AS (
  DELETE FROM public.chat_client_metrics t
  WHERE t.actor_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.actor_id)
  RETURNING 1
),
chat_device_subscriptions_deleted AS (
  DELETE FROM public.chat_device_subscriptions_v11 t
  WHERE t.user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.user_id)
  RETURNING 1
),
chat_encryption_keys_created_by_deleted AS (
  DELETE FROM public.chat_encryption_keys t
  WHERE t.created_by IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.created_by)
  RETURNING 1
),
chat_encryption_keys_sender_deleted AS (
  DELETE FROM public.chat_encryption_keys t
  WHERE t.sender_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.sender_id)
  RETURNING 1
),
chat_encryption_keys_recipient_deleted AS (
  DELETE FROM public.chat_encryption_keys t
  WHERE t.recipient_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.recipient_id)
  RETURNING 1
),
chat_events_deleted AS (
  DELETE FROM public.chat_events t
  WHERE t.actor_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.actor_id)
  RETURNING 1
),
chat_folders_deleted AS (
  DELETE FROM public.chat_folders t
  WHERE t.user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.user_id)
  RETURNING 1
),
chat_inbox_projection_deleted AS (
  DELETE FROM public.chat_inbox_projection t
  WHERE t.user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.user_id)
  RETURNING 1
),
chat_rate_limits_deleted AS (
  DELETE FROM public.chat_rate_limits t
  WHERE t.user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.user_id)
  RETURNING 1
),
chat_receipts_deleted AS (
  DELETE FROM public.chat_receipts t
  WHERE t.user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.user_id)
  RETURNING 1
),
chat_recovery_throttle_deleted AS (
  DELETE FROM public.chat_recovery_throttle t
  WHERE t.user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.user_id)
  RETURNING 1
),
chat_write_ledger_deleted AS (
  DELETE FROM public.chat_write_ledger t
  WHERE t.actor_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.actor_id)
  RETURNING 1
),
conversation_cursors_deleted AS (
  DELETE FROM public.conversation_cursors t
  WHERE t.user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.user_id)
  RETURNING 1
),
conversation_participants_deleted AS (
  DELETE FROM public.conversation_participants t
  WHERE t.user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.user_id)
  RETURNING 1
),
messages_deleted AS (
  DELETE FROM public.messages t
  WHERE t.sender_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.sender_id)
  RETURNING 1
)
SELECT 'chat_client_metrics.actor_id' AS target, COUNT(*) AS deleted_rows FROM chat_client_metrics_deleted
UNION ALL
SELECT 'chat_device_subscriptions_v11.user_id' AS target, COUNT(*) AS deleted_rows FROM chat_device_subscriptions_deleted
UNION ALL
SELECT 'chat_encryption_keys.created_by' AS target, COUNT(*) AS deleted_rows FROM chat_encryption_keys_created_by_deleted
UNION ALL
SELECT 'chat_encryption_keys.sender_id' AS target, COUNT(*) AS deleted_rows FROM chat_encryption_keys_sender_deleted
UNION ALL
SELECT 'chat_encryption_keys.recipient_id' AS target, COUNT(*) AS deleted_rows FROM chat_encryption_keys_recipient_deleted
UNION ALL
SELECT 'chat_events.actor_id' AS target, COUNT(*) AS deleted_rows FROM chat_events_deleted
UNION ALL
SELECT 'chat_folders.user_id' AS target, COUNT(*) AS deleted_rows FROM chat_folders_deleted
UNION ALL
SELECT 'chat_inbox_projection.user_id' AS target, COUNT(*) AS deleted_rows FROM chat_inbox_projection_deleted
UNION ALL
SELECT 'chat_rate_limits.user_id' AS target, COUNT(*) AS deleted_rows FROM chat_rate_limits_deleted
UNION ALL
SELECT 'chat_receipts.user_id' AS target, COUNT(*) AS deleted_rows FROM chat_receipts_deleted
UNION ALL
SELECT 'chat_recovery_throttle.user_id' AS target, COUNT(*) AS deleted_rows FROM chat_recovery_throttle_deleted
UNION ALL
SELECT 'chat_write_ledger.actor_id' AS target, COUNT(*) AS deleted_rows FROM chat_write_ledger_deleted
UNION ALL
SELECT 'conversation_cursors.user_id' AS target, COUNT(*) AS deleted_rows FROM conversation_cursors_deleted
UNION ALL
SELECT 'conversation_participants.user_id' AS target, COUNT(*) AS deleted_rows FROM conversation_participants_deleted
UNION ALL
SELECT 'messages.sender_id' AS target, COUNT(*) AS deleted_rows FROM messages_deleted
ORDER BY target;