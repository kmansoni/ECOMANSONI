-- ============================================================================
-- Phase 1 EPIC G Part 2: Explore Analytics & Metrics
--
-- Goals:
-- - Track Explore section interactions (clicks, views, sessions)
-- - Calculate Explore metrics (open_rate, to_watch_rate, session_length)
-- - Enable A/B testing and canary rollout monitoring
--
-- Metrics (from P1G spec):
-- - explore_open_rate: % of users who open Explore
-- - explore_to_watch_rate: % of Explore clicks that lead to watch
-- - explore_session_length: avg duration of Explore browsing
-- - explore_section_click_distribution: which sections get clicked most
--
-- Based on: docs/specs/phase1/P1G-explore-discovery-surface.md
-- ============================================================================

-- 1) Explore sessions tracking

CREATE TABLE IF NOT EXISTS public.explore_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_key TEXT NOT NULL, -- anonymous or authenticated session identifier
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  sections_viewed TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  sections_clicked TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  total_clicks INTEGER NOT NULL DEFAULT 0,
  total_watches INTEGER NOT NULL DEFAULT 0,
  algorithm_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_explore_sessions_user
  ON public.explore_sessions(user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_explore_sessions_started
  ON public.explore_sessions(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_explore_sessions_key
  ON public.explore_sessions(session_key, started_at DESC);

-- 2) Explore section clicks tracking

CREATE TABLE IF NOT EXISTS public.explore_section_clicks (
  click_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.explore_sessions(session_id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  section_type TEXT NOT NULL CHECK (section_type IN ('trending_now', 'hashtags', 'fresh_creators', 'categories', 'recommended_reels')),
  item_type TEXT NOT NULL CHECK (item_type IN ('reel', 'hashtag', 'creator', 'category')),
  item_id TEXT NOT NULL, -- reel_id, hashtag_id, user_id, category_id
  position_in_section INTEGER,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  did_watch BOOLEAN DEFAULT false,
  watch_duration_seconds INTEGER,
  algorithm_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_explore_section_clicks_session
  ON public.explore_section_clicks(session_id, clicked_at DESC);

CREATE INDEX IF NOT EXISTS idx_explore_section_clicks_user
  ON public.explore_section_clicks(user_id, clicked_at DESC);

CREATE INDEX IF NOT EXISTS idx_explore_section_clicks_section
  ON public.explore_section_clicks(section_type, clicked_at DESC);

CREATE INDEX IF NOT EXISTS idx_explore_section_clicks_item
  ON public.explore_section_clicks(item_type, item_id, clicked_at DESC);

-- 3) RPC: Start Explore session

CREATE OR REPLACE FUNCTION public.start_explore_session_v1(
  p_user_id UUID DEFAULT NULL,
  p_session_key TEXT DEFAULT NULL,
  p_algorithm_version TEXT DEFAULT 'v2.epic-g'
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id UUID;
  v_session_key TEXT;
BEGIN
  v_session_key := COALESCE(p_session_key, CONCAT('anon-', gen_random_uuid()::TEXT));

  INSERT INTO public.explore_sessions (
    user_id,
    session_key,
    started_at,
    algorithm_version
  ) VALUES (
    p_user_id,
    v_session_key,
    now(),
    COALESCE(p_algorithm_version, 'v2.epic-g')
  )
  RETURNING session_id INTO v_session_id;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_explore_session_v1(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_explore_session_v1(UUID, TEXT, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.start_explore_session_v1(UUID, TEXT, TEXT) IS
  'Phase 1 EPIC G: Start an Explore session for analytics tracking';

-- 4) RPC: End Explore session

CREATE OR REPLACE FUNCTION public.end_explore_session_v1(
  p_session_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_started_at TIMESTAMPTZ;
  v_ended_at TIMESTAMPTZ;
  v_duration INTEGER;
BEGIN
  SELECT started_at INTO v_started_at
  FROM public.explore_sessions
  WHERE session_id = p_session_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_ended_at := now();
  v_duration := EXTRACT(EPOCH FROM (v_ended_at - v_started_at))::INTEGER;

  UPDATE public.explore_sessions
  SET
    ended_at = v_ended_at,
    duration_seconds = v_duration,
    updated_at = now()
  WHERE session_id = p_session_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.end_explore_session_v1(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_explore_session_v1(UUID) TO anon, authenticated;

COMMENT ON FUNCTION public.end_explore_session_v1(UUID) IS
  'Phase 1 EPIC G: End an Explore session and calculate duration';

-- 5) RPC: Track Explore section click

CREATE OR REPLACE FUNCTION public.track_explore_click_v1(
  p_session_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_section_type TEXT,
  p_item_type TEXT,
  p_item_id TEXT,
  p_user_id UUID DEFAULT NULL,
  p_position_in_section INTEGER DEFAULT NULL,
  p_algorithm_version TEXT DEFAULT 'v2.epic-g'
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_click_id UUID;
BEGIN
  -- Insert click event
  INSERT INTO public.explore_section_clicks (
    session_id,
    user_id,
    section_type,
    item_type,
    item_id,
    position_in_section,
    clicked_at,
    algorithm_version
  ) VALUES (
    p_session_id,
    p_user_id,
    p_section_type,
    p_item_type,
    p_item_id,
    p_position_in_section,
    now(),
    COALESCE(p_algorithm_version, 'v2.epic-g')
  )
  RETURNING click_id INTO v_click_id;

  -- Update session stats
  UPDATE public.explore_sessions
  SET
    sections_clicked = array_append(sections_clicked, p_section_type),
    total_clicks = total_clicks + 1,
    updated_at = now()
  WHERE session_id = p_session_id;

  RETURN v_click_id;
END;
$$;

REVOKE ALL ON FUNCTION public.track_explore_click_v1(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_explore_click_v1(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.track_explore_click_v1(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, TEXT) IS
  'Phase 1 EPIC G: Track a click on an Explore section item';

-- 6) RPC: Update watch event (mark click as watched)

CREATE OR REPLACE FUNCTION public.update_explore_watch_v1(
  p_click_id UUID,
  p_watch_duration_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id UUID;
BEGIN
  UPDATE public.explore_section_clicks
  SET
    did_watch = true,
    watch_duration_seconds = p_watch_duration_seconds
  WHERE click_id = p_click_id
  RETURNING session_id INTO v_session_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Update session total_watches
  UPDATE public.explore_sessions
  SET
    total_watches = total_watches + 1,
    updated_at = now()
  WHERE session_id = v_session_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.update_explore_watch_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_explore_watch_v1(UUID, INTEGER) TO anon, authenticated;

COMMENT ON FUNCTION public.update_explore_watch_v1(UUID, INTEGER) IS
  'Phase 1 EPIC G: Mark an Explore click as watched with duration';

-- 7) Metrics calculation functions

-- Metric: explore_open_rate (% of users who opened Explore in last N days)
CREATE OR REPLACE FUNCTION public.calculate_explore_open_rate_v1(
  p_window_days INTEGER DEFAULT 7
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH total_users AS (
    SELECT COUNT(DISTINCT user_id)::NUMERIC AS cnt
    FROM public.profiles
    WHERE created_at >= (now() - make_interval(days => COALESCE(p_window_days, 7)))
  ),
  explore_users AS (
    SELECT COUNT(DISTINCT user_id)::NUMERIC AS cnt
    FROM public.explore_sessions
    WHERE started_at >= (now() - make_interval(days => COALESCE(p_window_days, 7)))
      AND user_id IS NOT NULL
  )
  SELECT
    CASE
      WHEN total_users.cnt > 0 THEN (explore_users.cnt / total_users.cnt) * 100
      ELSE 0
    END
  FROM total_users, explore_users;
$$;

REVOKE ALL ON FUNCTION public.calculate_explore_open_rate_v1(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_explore_open_rate_v1(INTEGER) TO service_role;

COMMENT ON FUNCTION public.calculate_explore_open_rate_v1(INTEGER) IS
  'Phase 1 EPIC G Metric: % of users who opened Explore in last N days';

-- Metric: explore_to_watch_rate (% of Explore clicks that led to watch)
CREATE OR REPLACE FUNCTION public.calculate_explore_to_watch_rate_v1(
  p_window_days INTEGER DEFAULT 7
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH total_clicks AS (
    SELECT COUNT(*)::NUMERIC AS cnt
    FROM public.explore_section_clicks
    WHERE clicked_at >= (now() - make_interval(days => COALESCE(p_window_days, 7)))
  ),
  watched_clicks AS (
    SELECT COUNT(*)::NUMERIC AS cnt
    FROM public.explore_section_clicks
    WHERE clicked_at >= (now() - make_interval(days => COALESCE(p_window_days, 7)))
      AND did_watch = true
  )
  SELECT
    CASE
      WHEN total_clicks.cnt > 0 THEN (watched_clicks.cnt / total_clicks.cnt) * 100
      ELSE 0
    END
  FROM total_clicks, watched_clicks;
$$;

REVOKE ALL ON FUNCTION public.calculate_explore_to_watch_rate_v1(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_explore_to_watch_rate_v1(INTEGER) TO service_role;

COMMENT ON FUNCTION public.calculate_explore_to_watch_rate_v1(INTEGER) IS
  'Phase 1 EPIC G Metric: % of Explore clicks that led to watch in last N days';

-- Metric: explore_session_length (avg duration in seconds)
CREATE OR REPLACE FUNCTION public.calculate_explore_session_length_v1(
  p_window_days INTEGER DEFAULT 7
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(AVG(duration_seconds), 0)::NUMERIC
  FROM public.explore_sessions
  WHERE started_at >= (now() - make_interval(days => COALESCE(p_window_days, 7)))
    AND ended_at IS NOT NULL
    AND duration_seconds IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.calculate_explore_session_length_v1(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_explore_session_length_v1(INTEGER) TO service_role;

COMMENT ON FUNCTION public.calculate_explore_session_length_v1(INTEGER) IS
  'Phase 1 EPIC G Metric: Average Explore session duration in seconds (last N days)';

-- Metric: explore_section_click_distribution (breakdown by section type)
CREATE OR REPLACE FUNCTION public.calculate_explore_section_distribution_v1(
  p_window_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  section_type TEXT,
  click_count BIGINT,
  click_percentage NUMERIC,
  avg_position NUMERIC,
  watch_rate NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH total AS (
    SELECT COUNT(*)::NUMERIC AS total_clicks
    FROM public.explore_section_clicks
    WHERE clicked_at >= (now() - make_interval(days => COALESCE(p_window_days, 7)))
  ),
  section_stats AS (
    SELECT
      esc.section_type,
      COUNT(*) AS click_count,
      AVG(esc.position_in_section) AS avg_position,
      (COUNT(*) FILTER (WHERE esc.did_watch = true)::NUMERIC / COUNT(*)::NUMERIC) * 100 AS watch_rate
    FROM public.explore_section_clicks esc
    WHERE esc.clicked_at >= (now() - make_interval(days => COALESCE(p_window_days, 7)))
    GROUP BY esc.section_type
  )
  SELECT
    ss.section_type,
    ss.click_count,
    (ss.click_count::NUMERIC / total.total_clicks) * 100 AS click_percentage,
    ss.avg_position,
    ss.watch_rate
  FROM section_stats ss, total
  ORDER BY ss.click_count DESC;
$$;

REVOKE ALL ON FUNCTION public.calculate_explore_section_distribution_v1(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_explore_section_distribution_v1(INTEGER) TO service_role;

COMMENT ON FUNCTION public.calculate_explore_section_distribution_v1(INTEGER) IS
  'Phase 1 EPIC G Metric: Explore section click distribution with watch rates (last N days)';

-- ============================================================================
-- Summary:
-- - ✅ explore_sessions table for session tracking
-- - ✅ explore_section_clicks table for click/watch events
-- - ✅ start_explore_session_v1(), end_explore_session_v1() RPCs
-- - ✅ track_explore_click_v1(), update_explore_watch_v1() RPCs
-- - ✅ Metric calculation functions (open_rate, to_watch_rate, session_length, section_distribution)
-- ============================================================================
