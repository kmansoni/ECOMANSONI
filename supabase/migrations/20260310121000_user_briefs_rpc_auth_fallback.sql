-- Safe public user brief resolver for client read paths.
-- Uses profiles first, then falls back to auth.users metadata if profiles data is missing.

CREATE OR REPLACE FUNCTION public.get_user_briefs(p_user_ids UUID[])
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  username TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH requested AS (
    SELECT DISTINCT id AS user_id
    FROM unnest(COALESCE(p_user_ids, ARRAY[]::UUID[])) AS t(id)
    WHERE id IS NOT NULL
  )
  SELECT
    r.user_id,
    COALESCE(
      NULLIF(BTRIM(p.display_name), ''),
      NULLIF(BTRIM(p.full_name), ''),
      NULLIF(BTRIM(u.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(BTRIM(u.raw_user_meta_data ->> 'name'), ''),
      NULLIF(BTRIM(p.username), ''),
      NULLIF(BTRIM(u.raw_user_meta_data ->> 'username'), ''),
      NULLIF(BTRIM(SPLIT_PART(u.email, '@', 1)), ''),
      'u_' || SUBSTRING(REPLACE(r.user_id::text, '-', ''), 1, 8)
    ) AS display_name,
    COALESCE(
      NULLIF(BTRIM(p.avatar_url), ''),
      NULLIF(BTRIM(u.raw_user_meta_data ->> 'avatar_url'), ''),
      NULLIF(BTRIM(u.raw_user_meta_data ->> 'picture'), '')
    ) AS avatar_url,
    COALESCE(
      NULLIF(BTRIM(p.username), ''),
      NULLIF(BTRIM(u.raw_user_meta_data ->> 'username'), ''),
      'u_' || SUBSTRING(REPLACE(r.user_id::text, '-', ''), 1, 16)
    ) AS username
  FROM requested r
  LEFT JOIN public.profiles p ON p.user_id = r.user_id
  LEFT JOIN auth.users u ON u.id = r.user_id;
$$;

REVOKE ALL ON FUNCTION public.get_user_briefs(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_briefs(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_briefs(UUID[]) TO service_role;
