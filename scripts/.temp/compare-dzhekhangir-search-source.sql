WITH target AS (
  SELECT 'c8e6756f-a17c-48b0-abf1-77d8f942bfc8'::uuid AS user_id
),
search_rows AS (
  SELECT s.*
  FROM public.search_user_profiles('дже', 20) s
  JOIN target t ON t.user_id = s.user_id
),
roles_global AS (
  SELECT ur.user_id, ur.role::text AS role
  FROM public.user_roles ur
  JOIN target t ON t.user_id = ur.user_id
),
roles_channel_member AS (
  SELECT cm.user_id, cm.channel_id, cm.role, cm.joined_at
  FROM public.channel_members cm
  JOIN target t ON t.user_id = cm.user_id
  WHERE cm.role = 'owner'
),
roles_channel_owner AS (
  SELECT c.owner_id AS user_id, c.id AS channel_id, c.name, c.created_at
  FROM public.channels c
  JOIN target t ON t.user_id = c.owner_id
)
SELECT jsonb_build_object(
  'target_user_id', (SELECT user_id::text FROM target),
  'search_source_table', 'public.profiles via public.search_user_profiles',
  'search_match_rows', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM search_rows s), '[]'::jsonb),
  'global_roles_user_roles', COALESCE((SELECT jsonb_agg(to_jsonb(rg)) FROM roles_global rg), '[]'::jsonb),
  'owner_roles_channel_members', COALESCE((SELECT jsonb_agg(to_jsonb(rcm)) FROM roles_channel_member rcm), '[]'::jsonb),
  'owner_roles_channels', COALESCE((SELECT jsonb_agg(to_jsonb(rco)) FROM roles_channel_owner rco), '[]'::jsonb)
) AS result;