-- Recommendations contract v2
-- Unified payload for carousel and modal with server-side filtering.

DROP FUNCTION IF EXISTS public.get_recommended_users_for_new_user(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.get_recommended_users_for_new_user(
  p_user_id UUID,
  limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  verified BOOLEAN,
  followers_count BIGINT,
  is_from_contacts BOOLEAN,
  reason TEXT,
  trust_score NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contacts_access BOOLEAN;
  v_contacts_phones TEXT[];
BEGIN
  SELECT contacts_access_granted, contacts_phones
  INTO v_contacts_access, v_contacts_phones
  FROM public.profiles
  WHERE profiles.user_id = p_user_id;

  IF v_contacts_access = true AND array_length(v_contacts_phones, 1) > 0 THEN
    RETURN QUERY
    SELECT
      p.user_id,
      p.username,
      p.display_name,
      p.avatar_url,
      p.verified,
      COUNT(DISTINCT f.follower_id) AS followers_count,
      true AS is_from_contacts,
      'contacts'::TEXT AS reason,
      0.95::NUMERIC AS trust_score
    FROM public.profiles p
    LEFT JOIN public.followers f ON f.following_id = p.user_id
    WHERE p.user_id <> p_user_id
      AND p.phone = ANY(v_contacts_phones)
      AND p.username IS NOT NULL
      AND btrim(p.username) <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM public.followers ff
        WHERE ff.follower_id = p_user_id
          AND ff.following_id = p.user_id
      )
    GROUP BY p.user_id, p.username, p.display_name, p.avatar_url, p.verified
    ORDER BY followers_count DESC, RANDOM()
    LIMIT limit_count;
  ELSE
    RETURN QUERY
    SELECT
      p.user_id,
      p.username,
      p.display_name,
      p.avatar_url,
      p.verified,
      COUNT(DISTINCT f.follower_id) AS followers_count,
      false AS is_from_contacts,
      'popular'::TEXT AS reason,
      LEAST(1::NUMERIC, LN(COUNT(DISTINCT f.follower_id) + 1)::NUMERIC / 5::NUMERIC) AS trust_score
    FROM public.profiles p
    LEFT JOIN public.followers f ON f.following_id = p.user_id
    WHERE p.user_id <> p_user_id
      AND p.username IS NOT NULL
      AND btrim(p.username) <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM public.followers ff
        WHERE ff.follower_id = p_user_id
          AND ff.following_id = p.user_id
      )
    GROUP BY p.user_id, p.username, p.display_name, p.avatar_url, p.verified
    ORDER BY followers_count DESC, RANDOM()
    LIMIT limit_count;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_recommended_users_for_new_user(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_recommended_users_for_new_user IS
  'Recommendations v2: unified contract with username, reason, trust score and server-side filtering of already-followed users.';
