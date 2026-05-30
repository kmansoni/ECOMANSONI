-- ============================================================================
-- Phase 1 EPIC J: Audience Demographics Functions
--
-- Provides real audience metrics for analytics:
-- - Gender distribution (from profiles.gender)
-- - Age distribution (from profiles.birth_date)
-- - Location distribution (from profiles.country)
-- - Active hours (from playback events)
-- - Profile visits (from profile_view_events)
--
-- Based on: docs/specs/phase1/P1J-creator-analytics-v1.md
-- ============================================================================

-- 1) Get audience gender distribution for a creator
CREATE OR REPLACE FUNCTION public.get_audience_gender_v1(
  p_creator_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH viewer_gender AS (
    SELECT DISTINCT p.gender
    FROM public.profiles p
    JOIN public.follows f ON f.followed_id = p.id
    WHERE f.follower_id IN (
      SELECT DISTINCT user_id
      FROM public.playback_events pe
      JOIN public.reels r ON r.id = pe.reel_id
      WHERE r.author_id = p_creator_id
      AND pe.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
      AND pe.user_id IS NOT NULL
    )
  )
  SELECT jsonb_build_object(
    'female', COALESCE(COUNT(*) FILTER (WHERE gender = 'female'), 0),
    'male', COALESCE(COUNT(*) FILTER (WHERE gender = 'male'), 0),
    'unknown', COALESCE(COUNT(*) FILTER (WHERE gender IS NULL OR gender NOT IN ('female', 'male')), 0)
  ) INTO v_result
  FROM viewer_gender;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_audience_gender_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_audience_gender_v1(UUID, INTEGER) TO authenticated, service_role;

-- 2) Get audience age distribution for a creator (based on birth_date)
CREATE OR REPLACE FUNCTION public.get_audience_age_v1(
  p_creator_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now DATE := CURRENT_DATE;
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    '13-17', COALESCE(COUNT(*) FILTER (WHERE p.birth_date >= v_now - INTERVAL '17 years' AND p.birth_date < v_now - INTERVAL '13 years'), 0)::INTEGER,
    '18-24', COALESCE(COUNT(*) FILTER (WHERE p.birth_date >= v_now - INTERVAL '24 years' AND p.birth_date < v_now - INTERVAL '18 years'), 0)::INTEGER,
    '25-34', COALESCE(COUNT(*) FILTER (WHERE p.birth_date >= v_now - INTERVAL '34 years' AND p.birth_date < v_now - INTERVAL '25 years'), 0)::INTEGER,
    '35-44', COALESCE(COUNT(*) FILTER (WHERE p.birth_date >= v_now - INTERVAL '44 years' AND p.birth_date < v_now - INTERVAL '35 years'), 0)::INTEGER,
    '45-54', COALESCE(COUNT(*) FILTER (WHERE p.birth_date >= v_now - INTERVAL '54 years' AND p.birth_date < v_now - INTERVAL '45 years'), 0)::INTEGER,
    '55-64', COALESCE(COUNT(*) FILTER (WHERE p.birth_date >= v_now - INTERVAL '64 years' AND p.birth_date < v_now - INTERVAL '55 years'), 0)::INTEGER,
    '65+', COALESCE(COUNT(*) FILTER (WHERE p.birth_date < v_now - INTERVAL '65 years'), 0)::INTEGER,
    'unknown', COALESCE(COUNT(*) FILTER (WHERE p.birth_date IS NULL), 0)::INTEGER
  ) INTO v_result
  FROM public.profiles p
  JOIN public.follows f ON f.followed_id = p.id
  WHERE f.follower_id IN (
    SELECT DISTINCT user_id
    FROM public.playback_events pe
    JOIN public.reels r ON r.id = pe.reel_id
    WHERE r.author_id = p_creator_id
    AND pe.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
    AND pe.user_id IS NOT NULL
  );

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_audience_age_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_audience_age_v1(UUID, INTEGER) TO authenticated;

-- 3) Get audience location distribution for a creator
CREATE OR REPLACE FUNCTION public.get_audience_locations_v1(
  p_creator_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'countries', COALESCE(jsonb_object_agg(p.country, cnt ORDER BY cnt DESC) FILTER (WHERE p.country IS NOT NULL), '[]'::JSONB),
    'cities', COALESCE(jsonb_object_agg(p.city, cnt ORDER BY cnt DESC) FILTER (WHERE p.city IS NOT NULL), '[]'::JSONB)
  ) INTO v_result
  FROM (
    SELECT p.country, p.city, COUNT(*) as cnt
    FROM public.profiles p
    JOIN public.follows f ON f.followed_id = p.id
    WHERE f.follower_id IN (
      SELECT DISTINCT user_id
      FROM public.playback_events pe
      JOIN public.reels r ON r.id = pe.reel_id
      WHERE r.author_id = p_creator_id
      AND pe.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
      AND pe.user_id IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.reels r
      JOIN public.playback_events pe ON pe.reel_id = r.id
      WHERE r.author_id = p_creator_id
      AND pe.user_id = p.id
    )
    GROUP BY p.country, p.city
  ) agg;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_audience_locations_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_audience_locations_v1(UUID, INTEGER) TO authenticated;

-- 4) Get audience active hours (hourly activity distribution)
CREATE OR REPLACE FUNCTION public.get_audience_active_hours_v1(
  p_creator_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_object_agg(
    EXTRACT(DOW FROM pe.created_at)::INTEGER::TEXT,
    jsonb_object_agg(EXTRACT(HOUR FROM pe.created_at)::INTEGER, cnt ORDER BY EXTRACT(HOUR FROM pe.created_at))
  ) INTO v_result
  FROM (
    SELECT 
      EXTRACT(DOW FROM pe.created_at)::INTEGER as dow,
      EXTRACT(HOUR FROM pe.created_at)::INTEGER as hr,
      COUNT(*) as cnt
    FROM public.playback_events pe
    JOIN public.reels r ON r.id = pe.reel_id
    WHERE r.author_id = p_creator_id
    AND pe.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
    AND pe.user_id IS NOT NULL
    GROUP BY dow, hr
    ORDER BY dow, hr
  ) x;

  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;
REVOKE ALL ON FUNCTION public.get_audience_active_hours_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_audience_active_hours_v1(UUID, INTEGER) TO authenticated;

-- 5) Get profile visits count
CREATE OR REPLACE FUNCTION public.get_profile_visits_v1(
  p_creator_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM public.profile_view_events pve
  JOIN public.profiles p ON p.id = pve.viewer_id
  WHERE pve.profile_id = p_creator_id
  AND pve.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)));

  RETURN jsonb_build_object('count', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.get_profile_visits_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_visits_v1(UUID, INTEGER) TO authenticated, service_role;

-- 6) Get link clicks count (bios link clicks)
CREATE OR REPLACE FUNCTION public.get_link_clicks_v1(
  p_creator_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM public.link_click_events lce
  WHERE lce.profile_id = p_creator_id
  AND lce.created_at >= (now() - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)));

  RETURN jsonb_build_object('count', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.get_link_clicks_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_link_clicks_v1(UUID, INTEGER) TO authenticated, service_role;

-- ============================================================================
-- Summary:
-- - ✅ get_audience_gender_v1(creator_id, days): Gender distribution from profiles.follows
-- - ✅ get_audience_age_v1(creator_id, days): Age distribution from birth_date
-- - ✅ get_audience_locations_v1(creator_id, days): Country/city distribution
-- - ✅ get_audience_active_hours_v1(creator_id, days): Hourly activity heatmap
-- - ✅ get_profile_visits_v1(creator_id, days): Profile visit count
-- - ✅ get_link_clicks_v1(creator_id, days): Bio link click count
-- ============================================================================