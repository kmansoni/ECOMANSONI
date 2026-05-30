-- ============================================================================
-- Profile sends tracking for analytics
--
-- Gets the count of profile sends (shares to friends)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_profile_sends_v1(
  p_creator_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (sends BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
BEGIN
  -- Count unique shares/sends of creator's content
  SELECT COUNT(DISTINCT pe.user_id)
  INTO v_total
  FROM public.playback_events pe
  JOIN public.reels r ON r.id = pe.reel_id
  WHERE r.author_id = p_creator_id
  AND pe.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
  AND pe.user_id IS NOT NULL;

  RETURN QUERY SELECT v_total;
END;
$$;
REVOKE ALL ON FUNCTION public.get_profile_sends_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_sends_v1(UUID, INTEGER) TO authenticated;