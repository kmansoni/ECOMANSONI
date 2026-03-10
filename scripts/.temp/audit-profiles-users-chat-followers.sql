WITH
users_missing_profiles AS (
  SELECT u.id
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE p.user_id IS NULL
),
chat_participants_missing_profiles AS (
  SELECT DISTINCT cp.user_id AS id
  FROM public.conversation_participants cp
  LEFT JOIN public.profiles p ON p.user_id = cp.user_id
  WHERE p.user_id IS NULL
),
chat_message_senders_missing_profiles AS (
  SELECT DISTINCT m.sender_id AS id
  FROM public.messages m
  LEFT JOIN public.profiles p ON p.user_id = m.sender_id
  WHERE p.user_id IS NULL
),
followers_follower_missing_profiles AS (
  SELECT DISTINCT f.follower_id AS id
  FROM public.followers f
  LEFT JOIN public.profiles p ON p.user_id = f.follower_id
  WHERE p.user_id IS NULL
),
followers_following_missing_profiles AS (
  SELECT DISTINCT f.following_id AS id
  FROM public.followers f
  LEFT JOIN public.profiles p ON p.user_id = f.following_id
  WHERE p.user_id IS NULL
)
SELECT
  (SELECT COUNT(*) FROM auth.users) AS total_auth_users,
  (SELECT COUNT(*) FROM public.profiles) AS total_profiles,
  (SELECT COUNT(*) FROM users_missing_profiles) AS users_without_profile,
  (SELECT COUNT(*) FROM chat_participants_missing_profiles) AS chat_participants_without_profile,
  (SELECT COUNT(*) FROM chat_message_senders_missing_profiles) AS chat_message_senders_without_profile,
  (SELECT COUNT(*) FROM followers_follower_missing_profiles) AS follower_ids_without_profile,
  (SELECT COUNT(*) FROM followers_following_missing_profiles) AS following_ids_without_profile,
  (SELECT COALESCE(json_agg(id), '[]'::json) FROM (SELECT id FROM users_missing_profiles ORDER BY id LIMIT 20) s) AS sample_users_without_profile,
  (SELECT COALESCE(json_agg(id), '[]'::json) FROM (SELECT id FROM chat_participants_missing_profiles ORDER BY id LIMIT 20) s) AS sample_chat_participants_without_profile,
  (SELECT COALESCE(json_agg(id), '[]'::json) FROM (SELECT id FROM chat_message_senders_missing_profiles ORDER BY id LIMIT 20) s) AS sample_chat_message_senders_without_profile,
  (SELECT COALESCE(json_agg(id), '[]'::json) FROM (SELECT id FROM followers_follower_missing_profiles ORDER BY id LIMIT 20) s) AS sample_follower_ids_without_profile,
  (SELECT COALESCE(json_agg(id), '[]'::json) FROM (SELECT id FROM followers_following_missing_profiles ORDER BY id LIMIT 20) s) AS sample_following_ids_without_profile;
