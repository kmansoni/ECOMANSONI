-- User search RPC for chat/explore lookups.
-- Uses SECURITY DEFINER so search works even if profiles SELECT policies differ across environments.
-- Returns only non-sensitive public profile fields.

CREATE OR REPLACE FUNCTION public.search_user_profiles(
  p_query TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  username TEXT,
  full_name TEXT,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  verified BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q TEXT := COALESCE(BTRIM(p_query), '');
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_norm TEXT;
BEGIN
  -- Only authenticated clients can use search.
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF length(v_q) < 2 THEN
    RETURN;
  END IF;

  v_norm := lower(v_q);

  RETURN QUERY
  SELECT
    p.user_id,
    p.display_name,
    p.username,
    p.full_name,
    p.first_name,
    p.last_name,
    p.avatar_url,
    p.bio,
    p.verified
  FROM public.profiles p
  WHERE
    position(v_norm in lower(COALESCE(p.display_name, ''))) > 0
    OR position(v_norm in lower(COALESCE(p.username, ''))) > 0
    OR position(v_norm in lower(COALESCE(p.full_name, ''))) > 0
    OR position(v_norm in lower(COALESCE(p.first_name, ''))) > 0
    OR position(v_norm in lower(COALESCE(p.last_name, ''))) > 0
  ORDER BY
    CASE
      WHEN lower(COALESCE(p.display_name, '')) LIKE v_norm || '%' THEN 0
      WHEN lower(COALESCE(p.full_name, '')) LIKE v_norm || '%' THEN 1
      WHEN lower(COALESCE(p.first_name, '')) LIKE v_norm || '%' THEN 2
      WHEN lower(COALESCE(p.username, '')) LIKE v_norm || '%' THEN 3
      ELSE 4
    END,
    p.updated_at DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_user_profiles(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_user_profiles(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_user_profiles(TEXT, INTEGER) TO service_role;
