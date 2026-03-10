WITH
participants_distinct AS (
  SELECT DISTINCT user_id FROM public.conversation_participants
),
participants_missing_profiles AS (
  SELECT p.user_id
  FROM participants_distinct p
  LEFT JOIN public.profiles pr ON pr.user_id = p.user_id
  WHERE pr.user_id IS NULL
),
senders_distinct AS (
  SELECT DISTINCT sender_id AS user_id FROM public.messages
),
senders_missing_profiles AS (
  SELECT s.user_id
  FROM senders_distinct s
  LEFT JOIN public.profiles pr ON pr.user_id = s.user_id
  WHERE pr.user_id IS NULL
),
participants_missing_in_auth AS (
  SELECT p.user_id
  FROM participants_distinct p
  LEFT JOIN auth.users u ON u.id = p.user_id
  WHERE u.id IS NULL
),
senders_missing_in_auth AS (
  SELECT s.user_id
  FROM senders_distinct s
  LEFT JOIN auth.users u ON u.id = s.user_id
  WHERE u.id IS NULL
)
SELECT
  (SELECT COUNT(*) FROM participants_distinct) AS distinct_chat_participants,
  (SELECT COUNT(*) FROM participants_missing_profiles) AS distinct_chat_participants_missing_profile,
  (SELECT COUNT(*) FROM participants_missing_in_auth) AS distinct_chat_participants_missing_auth,
  (SELECT COUNT(*) FROM senders_distinct) AS distinct_chat_senders,
  (SELECT COUNT(*) FROM senders_missing_profiles) AS distinct_chat_senders_missing_profile,
  (SELECT COUNT(*) FROM senders_missing_in_auth) AS distinct_chat_senders_missing_auth,
  (SELECT COALESCE(json_agg(user_id), '[]'::json) FROM (SELECT user_id FROM participants_missing_profiles ORDER BY user_id LIMIT 20) s) AS sample_chat_participants_missing_profile,
  (SELECT COALESCE(json_agg(user_id), '[]'::json) FROM (SELECT user_id FROM senders_missing_profiles ORDER BY user_id LIMIT 20) s) AS sample_chat_senders_missing_profile;
