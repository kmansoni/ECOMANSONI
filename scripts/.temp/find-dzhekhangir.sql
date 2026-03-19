WITH needle AS (
  SELECT 'джехангир мансуров'::text AS q
),
profiles_hit AS (
  SELECT
    'profiles'::text AS source,
    p.user_id,
    p.display_name,
    p.full_name,
    p.first_name,
    p.last_name,
    p.username,
    p.updated_at::text AS updated_at
  FROM public.profiles p, needle n
  WHERE
    lower(coalesce(p.display_name, '')) LIKE '%' || split_part(n.q, ' ', 1) || '%'
    OR lower(coalesce(p.full_name, '')) LIKE '%' || split_part(n.q, ' ', 1) || '%'
    OR lower(coalesce(p.first_name, '')) LIKE '%' || split_part(n.q, ' ', 1) || '%'
    OR lower(coalesce(p.last_name, '')) LIKE '%' || split_part(n.q, ' ', 2) || '%'
),
auth_hit AS (
  SELECT
    'auth.users'::text AS source,
    u.id AS user_id,
    coalesce(u.raw_user_meta_data->>'display_name', u.raw_user_meta_data->>'full_name') AS display_name,
    u.raw_user_meta_data->>'full_name' AS full_name,
    u.raw_user_meta_data->>'first_name' AS first_name,
    u.raw_user_meta_data->>'last_name' AS last_name,
    u.raw_user_meta_data->>'username' AS username,
    u.updated_at::text AS updated_at
  FROM auth.users u, needle n
  WHERE
    lower(coalesce(u.raw_user_meta_data->>'display_name', '')) LIKE '%' || split_part(n.q, ' ', 1) || '%'
    OR lower(coalesce(u.raw_user_meta_data->>'full_name', '')) LIKE '%' || split_part(n.q, ' ', 1) || '%'
    OR lower(coalesce(u.raw_user_meta_data->>'first_name', '')) LIKE '%' || split_part(n.q, ' ', 1) || '%'
    OR lower(coalesce(u.raw_user_meta_data->>'last_name', '')) LIKE '%' || split_part(n.q, ' ', 2) || '%'
)
SELECT * FROM profiles_hit
UNION ALL
SELECT * FROM auth_hit
ORDER BY source, updated_at DESC;