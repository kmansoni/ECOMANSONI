WITH
followers_ids AS (
  SELECT follower_id AS user_id, 'follower_id'::text AS source FROM public.followers
  UNION ALL
  SELECT following_id AS user_id, 'following_id'::text AS source FROM public.followers
),
followers_ids_distinct AS (
  SELECT DISTINCT user_id FROM followers_ids
),
followers_missing_profiles AS (
  SELECT f.user_id
  FROM followers_ids_distinct f
  LEFT JOIN public.profiles p ON p.user_id = f.user_id
  WHERE p.user_id IS NULL
),
followers_missing_profiles_but_in_auth AS (
  SELECT f.user_id
  FROM followers_missing_profiles f
  JOIN auth.users u ON u.id = f.user_id
),
followers_missing_profiles_and_auth AS (
  SELECT f.user_id
  FROM followers_missing_profiles f
  LEFT JOIN auth.users u ON u.id = f.user_id
  WHERE u.id IS NULL
),
chat_participants_total AS (
  SELECT COUNT(*) AS n FROM public.conversation_participants
),
chat_messages_total AS (
  SELECT COUNT(*) AS n FROM public.messages
)
SELECT
  (SELECT COUNT(*) FROM public.followers) AS followers_rows_total,
  (SELECT COUNT(*) FROM followers_ids_distinct) AS distinct_user_ids_in_followers,
  (SELECT COUNT(*) FROM followers_missing_profiles) AS distinct_user_ids_in_followers_missing_profile,
  (SELECT COUNT(*) FROM followers_missing_profiles_but_in_auth) AS missing_profile_but_exists_in_auth,
  (SELECT COUNT(*) FROM followers_missing_profiles_and_auth) AS missing_profile_and_missing_in_auth,
  (SELECT n FROM chat_participants_total) AS chat_participants_rows_total,
  (SELECT n FROM chat_messages_total) AS chat_messages_rows_total,
  (SELECT COALESCE(json_agg(user_id), '[]'::json) FROM (SELECT user_id FROM followers_missing_profiles_but_in_auth ORDER BY user_id LIMIT 20) s) AS sample_missing_profile_but_in_auth,
  (SELECT COALESCE(json_agg(user_id), '[]'::json) FROM (SELECT user_id FROM followers_missing_profiles_and_auth ORDER BY user_id LIMIT 20) s) AS sample_missing_profile_and_missing_auth;
