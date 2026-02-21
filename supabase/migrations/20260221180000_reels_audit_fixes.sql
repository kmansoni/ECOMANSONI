-- ============================================================================
-- REELS AUDIT FIXES (P0)
--
-- Fixes discovered during second-pass security/contract audit:
--  1) record_reel_impression_v2 used "ON CONFLICT ON CONSTRAINT" with UNIQUE
--     INDEX name. Postgres only accepts constraint names there.
--     -> Switch to partial-index inference: ON CONFLICT (cols) WHERE (predicate)
--  2) get_user_reels_v1 didn't enforce not_interested blocks (auth viewers).
--     -> Add feedback exclusion to RPC.
--  3) Enforce "single decision point": revoke direct EXECUTE on
--     reels_engine_set/clear_pipeline_suppression from service_role.
--     -> All mutations go through reels_engine_apply_action.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Fix: record_reel_impression_v2 idempotency via partial unique indexes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_reel_impression_v2(
  p_reel_id UUID,
  p_session_id TEXT DEFAULT NULL,
  p_request_id UUID DEFAULT NULL,
  p_position INTEGER DEFAULT NULL,
  p_source TEXT DEFAULT 'reels',
  p_algorithm_version TEXT DEFAULT NULL,
  p_score NUMERIC DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL AND (p_session_id IS NULL OR length(trim(p_session_id)) = 0) THEN
    RAISE EXCEPTION 'record_reel_impression_v2 requires auth or session_id';
  END IF;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.reel_impressions(
      user_id,
      session_id,
      reel_id,
      request_id,
      position,
      source,
      algorithm_version,
      score
    )
    VALUES (
      v_user_id,
      NULL,
      p_reel_id,
      p_request_id,
      p_position,
      p_source,
      p_algorithm_version,
      p_score
    )
    ON CONFLICT (request_id, user_id, reel_id)
      WHERE request_id IS NOT NULL AND user_id IS NOT NULL
      DO NOTHING;
  ELSE
    INSERT INTO public.reel_impressions(
      user_id,
      session_id,
      reel_id,
      request_id,
      position,
      source,
      algorithm_version,
      score
    )
    VALUES (
      NULL,
      p_session_id,
      p_reel_id,
      p_request_id,
      p_position,
      p_source,
      p_algorithm_version,
      p_score
    )
    ON CONFLICT (request_id, session_id, reel_id)
      WHERE request_id IS NOT NULL AND user_id IS NULL AND session_id IS NOT NULL
      DO NOTHING;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_reel_impression_v2(UUID, TEXT, UUID, INTEGER, TEXT, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_reel_impression_v2(UUID, TEXT, UUID, INTEGER, TEXT, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_reel_impression_v2(UUID, TEXT, UUID, INTEGER, TEXT, TEXT, NUMERIC) TO anon;

COMMENT ON FUNCTION public.record_reel_impression_v2 IS
  'Idempotent impression tracking using partial unique-index inference (request_id,user_id,reel_id) / (request_id,session_id,reel_id).';

-- ---------------------------------------------------------------------------
-- 2) Fix: get_user_reels_v1 must respect viewer blocks (auth only)
-- ---------------------------------------------------------------------------
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
  WITH blocked AS (
    -- For profile tabs we have auth.uid(); session-based blocks would require
    -- changing the RPC signature (non-P0 / breaking).
    SELECT f.reel_id
    FROM public.user_reel_feedback f
    WHERE v_user_id IS NOT NULL
      AND f.user_id = v_user_id
      AND f.feedback = 'not_interested'
  )
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
    AND r.id NOT IN (SELECT reel_id FROM blocked)

    AND COALESCE(r.moderation_status, 'pending') <> 'blocked'
    AND (
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

REVOKE EXECUTE ON FUNCTION public.get_user_reels_v1(UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_reels_v1(UUID, INTEGER, INTEGER) TO authenticated, anon;

COMMENT ON FUNCTION public.get_user_reels_v1 IS
  'Profile RPC: returns author reels with moderation/channel gating; excludes viewer not_interested blocks for authenticated viewers.';

-- ---------------------------------------------------------------------------
-- 3) Enforce single decision point: revoke direct pipeline mutator EXECUTE
-- ---------------------------------------------------------------------------
-- These RPC must only be accessible through reels_engine_apply_action (via
-- action_type='set_pipeline_suppression'/'clear_pipeline_suppression') to
-- ensure they are: (a) idempotent, (b) journaled, (c) rate-limited.
--
-- The functions remain in code (internal use only), but we revoke the EXECUTE
-- grant from service_role to prevent bypass.

REVOKE EXECUTE ON FUNCTION public.reels_engine_set_pipeline_suppression(TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.reels_engine_clear_pipeline_suppression(TEXT, TEXT, TEXT) FROM service_role;

COMMENT ON FUNCTION public.reels_engine_set_pipeline_suppression IS
  'DEPRECATED: Use reels_engine_apply_action(action_type=''set_pipeline_suppression'') for idempotent journaling. This function is callable from apply_action only (not directly).';

COMMENT ON FUNCTION public.reels_engine_clear_pipeline_suppression IS
  'DEPRECATED: Use reels_engine_apply_action(action_type=''clear_pipeline_suppression'') for idempotent journaling. This function is callable from apply_action only (not directly).';
