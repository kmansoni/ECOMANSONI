-- ============================================================================
-- Phase 1 EPIC J: Age-Gender Breakdown Function
--
-- Provides age distribution broken down by gender for audience analytics.
-- Used by DoubleBar component in CreatorAnalyticsDashboard to show gender split
-- within each age group instead of hardcoded 0.45/0.35 percentages.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_audience_age_gender_v1(
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
  WITH audience_data AS (
    SELECT p.gender, p.birth_date
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
  ),
  age_gender_counts AS (
    SELECT
      CASE
        WHEN birth_date >= CURRENT_DATE - INTERVAL '17 years' AND birth_date < CURRENT_DATE - INTERVAL '13 years' THEN '13-17'
        WHEN birth_date >= CURRENT_DATE - INTERVAL '24 years' AND birth_date < CURRENT_DATE - INTERVAL '18 years' THEN '18-24'
        WHEN birth_date >= CURRENT_DATE - INTERVAL '34 years' AND birth_date < CURRENT_DATE - INTERVAL '25 years' THEN '25-34'
        WHEN birth_date >= CURRENT_DATE - INTERVAL '44 years' AND birth_date < CURRENT_DATE - INTERVAL '35 years' THEN '35-44'
        WHEN birth_date >= CURRENT_DATE - INTERVAL '54 years' AND birth_date < CURRENT_DATE - INTERVAL '45 years' THEN '45-54'
        WHEN birth_date >= CURRENT_DATE - INTERVAL '64 years' AND birth_date < CURRENT_DATE - INTERVAL '55 years' THEN '55-64'
        WHEN birth_date < CURRENT_DATE - INTERVAL '65 years' THEN '65+'
        ELSE 'unknown'
      END AS age_group,
      gender,
      COUNT(*)::INTEGER AS cnt
    FROM audience_data
    GROUP BY age_group, gender
  )
  SELECT jsonb_object_agg(
    age_group,
    jsonb_build_object(
      'female', COALESCE(SUM(cnt) FILTER (WHERE gender = 'female'), 0),
      'male', COALESCE(SUM(cnt) FILTER (WHERE gender = 'male'), 0),
      'unknown', COALESCE(SUM(cnt) FILTER (WHERE gender IS NULL OR gender NOT IN ('female', 'male')), 0)
    )
  ) INTO v_result
  FROM age_gender_counts;

  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;
REVOKE ALL ON FUNCTION public.get_audience_age_gender_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_audience_age_gender_v1(UUID, INTEGER) TO authenticated, service_role;