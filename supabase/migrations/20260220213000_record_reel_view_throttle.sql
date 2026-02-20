-- Record reel view with throttling and self-view exclusion.
-- Rules:
-- - Author's own reel views are not counted.
-- - For authenticated viewers: at most 1 view per (reel_id, user_id) per 10 seconds.
-- - For anonymous viewers: at most 1 view per (reel_id, session_id) per 10 seconds.

CREATE INDEX IF NOT EXISTS idx_reel_views_reel_user_viewed_at_desc
ON public.reel_views (reel_id, user_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_reel_views_reel_session_viewed_at_desc
ON public.reel_views (reel_id, session_id, viewed_at DESC);

CREATE OR REPLACE FUNCTION public.record_reel_view(
  p_reel_id UUID,
  p_session_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_author_id UUID;
  v_last_viewed_at TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();

  SELECT r.author_id
  INTO v_author_id
  FROM public.reels r
  WHERE r.id = p_reel_id;

  IF v_author_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Do not count self-views.
  IF v_user_id IS NOT NULL AND v_user_id = v_author_id THEN
    RETURN FALSE;
  END IF;

  IF v_user_id IS NOT NULL THEN
    SELECT rv.viewed_at
    INTO v_last_viewed_at
    FROM public.reel_views rv
    WHERE rv.reel_id = p_reel_id
      AND rv.user_id = v_user_id
    ORDER BY rv.viewed_at DESC
    LIMIT 1;

    IF v_last_viewed_at IS NULL OR v_last_viewed_at <= now() - INTERVAL '10 seconds' THEN
      INSERT INTO public.reel_views (reel_id, user_id, session_id)
      VALUES (p_reel_id, v_user_id, NULL);
      RETURN TRUE;
    END IF;

    RETURN FALSE;
  END IF;

  -- Anonymous viewer path
  IF p_session_id IS NULL OR length(btrim(p_session_id)) = 0 THEN
    RETURN FALSE;
  END IF;

  SELECT rv.viewed_at
  INTO v_last_viewed_at
  FROM public.reel_views rv
  WHERE rv.reel_id = p_reel_id
    AND rv.session_id = p_session_id
  ORDER BY rv.viewed_at DESC
  LIMIT 1;

  IF v_last_viewed_at IS NULL OR v_last_viewed_at <= now() - INTERVAL '10 seconds' THEN
    INSERT INTO public.reel_views (reel_id, user_id, session_id)
    VALUES (p_reel_id, NULL, p_session_id);
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_reel_view(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.record_reel_view(UUID, TEXT) TO authenticated;
