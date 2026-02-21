-- ============================================================================
-- STEP 10: User Reels RPC for profile tabs (author-specific reels + pagination)
--
-- Purpose:
--  - Allow Profile/UserProfile Reels tab to display a user's reels.
--  - Enforce the same visibility rules as the main feed:
--      * never show blocked
--      * enforce sensitive content rules (NSFW/graphic violence/extremism)
--      * respect channel visibility + membership
--  - Keep it simple: server is source of truth; client can paginate.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_reels_v1(
  p_author_id UUID,
  p_limit INTEGER DEFAULT 30,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  author_id UUID,
  video_url TEXT,
  thumbnail_url TEXT,
  description TEXT,
  music_title TEXT,
  likes_count INTEGER,
  comments_count INTEGER,
  views_count INTEGER,
  saves_count INTEGER,
  reposts_count INTEGER,
  shares_count INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'get_user_reels_v1 requires author_id';
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.author_id,
    r.video_url,
    r.thumbnail_url,
    r.description,
    r.music_title,
    r.likes_count,
    r.comments_count,
    r.views_count,
    COALESCE(r.saves_count, 0) AS saves_count,
    COALESCE(r.reposts_count, 0) AS reposts_count,
    COALESCE(r.shares_count, 0) AS shares_count,
    r.created_at
  FROM public.reels r
  LEFT JOIN public.channels ch ON ch.id = r.channel_id
  WHERE r.author_id = p_author_id

    -- moderation enforcement
    AND COALESCE(r.moderation_status, 'pending') <> 'blocked'
    AND (
      -- general content is ok anywhere it is visible (public reels + public channels)
      (
        COALESCE(r.is_nsfw, false) = false
        AND COALESCE(r.is_graphic_violence, false) = false
        AND COALESCE(r.is_political_extremism, false) = false
        AND (
          r.channel_id IS NULL
          OR COALESCE(ch.is_public, false) = true
          OR (v_user_id IS NOT NULL AND public.is_channel_member(r.channel_id, v_user_id))
        )
      )
      OR
      -- sensitive content allowed only in private channels to authenticated members
      (
        (COALESCE(r.is_nsfw, false) = true OR COALESCE(r.is_graphic_violence, false) = true OR COALESCE(r.is_political_extremism, false) = true)
        AND r.channel_id IS NOT NULL
        AND COALESCE(ch.is_public, false) = false
        AND v_user_id IS NOT NULL
        AND public.is_channel_member(r.channel_id, v_user_id)
      )
    )
  ORDER BY r.created_at DESC
  LIMIT GREATEST(0, COALESCE(p_limit, 30))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_reels_v1(UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_reels_v1(UUID, INTEGER, INTEGER) TO authenticated, anon;

COMMENT ON FUNCTION public.get_user_reels_v1 IS
  'Profile RPC: returns reels for a specific author_id with moderation/channel visibility enforcement and pagination.';
