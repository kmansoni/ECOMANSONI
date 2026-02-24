-- ============================================================================
-- Phase 1 EPIC J Part 3: Creator Analytics - Insights and Recommendations
--
-- Goals:
-- - Provide actionable, neutral insights to creators
-- - Detect retention issues (low watched_rate)
-- - Detect hook issues (low view_starts/impressions)
-- - Detect safety issues (high report rate)
-- - Never reveal algorithm internals
--
-- Based on: docs/specs/phase1/P1J-creator-analytics-v1.md
-- ============================================================================

-- 1) Calculate retention insight (watched_rate)

CREATE OR REPLACE FUNCTION public.calculate_retention_insight_v1(
  p_reel_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metrics RECORD;
  v_benchmark_watched_rate NUMERIC := 30.0;  -- Platform average: 30%
  v_result JSONB;
BEGIN
  SELECT * INTO v_metrics
  FROM public.reel_metrics
  WHERE reel_id = p_reel_id;

  IF NOT FOUND OR v_metrics.view_starts < 20 THEN
    RETURN jsonb_build_object(
      'type', 'retention',
      'status', 'insufficient_data',
      'hint', null,
      'threshold', null
    );
  END IF;

  -- Detect low retention
  IF v_metrics.watched_rate < v_benchmark_watched_rate THEN
    v_result := jsonb_build_object(
      'type', 'retention',
      'status', 'low',
      'watched_rate', ROUND(v_metrics.watched_rate, 1),
      'benchmark', ROUND(v_benchmark_watched_rate, 1),
      'hint', 'Большинство зрителей не досматривают до конца. Попробуйте: динамичные первые 3 секунды, яркий визуал, интригующий сюжет.',
      'threshold', v_benchmark_watched_rate
    );
  ELSE
    v_result := jsonb_build_object(
      'type', 'retention',
      'status', 'good',
      'watched_rate', ROUND(v_metrics.watched_rate, 1),
      'benchmark', ROUND(v_benchmark_watched_rate, 1),
      'hint', null,
      'threshold', null
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_retention_insight_v1(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_retention_insight_v1(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.calculate_retention_insight_v1(UUID) IS
  'Phase 1 EPIC J: Detect low retention and provide actionable hints';

-- 2) Calculate hook insight (view_starts / impressions)

CREATE OR REPLACE FUNCTION public.calculate_hook_insight_v1(
  p_reel_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metrics RECORD;
  v_view_start_rate NUMERIC;
  v_benchmark_view_start_rate NUMERIC := 40.0;  -- Platform average: 40%
  v_result JSONB;
BEGIN
  SELECT * INTO v_metrics
  FROM public.reel_metrics
  WHERE reel_id = p_reel_id;

  IF NOT FOUND OR v_metrics.impressions < 50 THEN
    RETURN jsonb_build_object(
      'type', 'hook',
      'status', 'insufficient_data',
      'hint', null,
      'threshold', null
    );
  END IF;

  -- Calculate view_start_rate
  IF v_metrics.impressions > 0 THEN
    v_view_start_rate := (v_metrics.view_starts::NUMERIC / v_metrics.impressions::NUMERIC) * 100;
  ELSE
    v_view_start_rate := 0;
  END IF;

  -- Detect low hook
  IF v_view_start_rate < v_benchmark_view_start_rate THEN
    v_result := jsonb_build_object(
      'type', 'hook',
      'status', 'low',
      'view_start_rate', ROUND(v_view_start_rate, 1),
      'benchmark', ROUND(v_benchmark_view_start_rate, 1),
      'hint', 'Мало кто начинает смотреть. Попробуйте: яркая обложка, крупный текст в первом кадре, эмоциональное выражение лица.',
      'threshold', v_benchmark_view_start_rate
    );
  ELSE
    v_result := jsonb_build_object(
      'type', 'hook',
      'status', 'good',
      'view_start_rate', ROUND(v_view_start_rate, 1),
      'benchmark', ROUND(v_benchmark_view_start_rate, 1),
      'hint', null,
      'threshold', null
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_hook_insight_v1(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_hook_insight_v1(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.calculate_hook_insight_v1(UUID) IS
  'Phase 1 EPIC J: Detect low view_start_rate and provide hook improvement hints';

-- 3) Calculate safety insight (report rate)

CREATE OR REPLACE FUNCTION public.calculate_safety_insight_v1(
  p_reel_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metrics RECORD;
  v_report_rate NUMERIC;
  v_threshold_report_rate NUMERIC := 5.0;  -- Warning if > 5%
  v_result JSONB;
BEGIN
  SELECT * INTO v_metrics
  FROM public.reel_metrics
  WHERE reel_id = p_reel_id;

  IF NOT FOUND OR v_metrics.unique_viewers < 20 THEN
    RETURN jsonb_build_object(
      'type', 'safety',
      'status', 'insufficient_data',
      'hint', null,
      'threshold', null
    );
  END IF;

  -- Calculate report_rate
  IF v_metrics.unique_viewers > 0 THEN
    v_report_rate := (v_metrics.reports::NUMERIC / v_metrics.unique_viewers::NUMERIC) * 100;
  ELSE
    v_report_rate := 0;
  END IF;

  -- Detect high report rate
  IF v_report_rate > v_threshold_report_rate THEN
    v_result := jsonb_build_object(
      'type', 'safety',
      'status', 'warning',
      'report_rate', ROUND(v_report_rate, 1),
      'threshold', ROUND(v_threshold_report_rate, 1),
      'hint', 'Повышенное число жалоб. Проверьте контент на соответствие правилам сообщества.',
      'severity', 'high'
    );
  ELSE
    v_result := jsonb_build_object(
      'type', 'safety',
      'status', 'good',
      'report_rate', ROUND(v_report_rate, 1),
      'threshold', ROUND(v_threshold_report_rate, 1),
      'hint', null,
      'severity', null
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_safety_insight_v1(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_safety_insight_v1(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.calculate_safety_insight_v1(UUID) IS
  'Phase 1 EPIC J: Detect high report rate and provide safety warnings';

-- 4) Get all insights for a reel (unified API)

CREATE OR REPLACE FUNCTION public.get_reel_insights_v1(
  p_reel_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reel RECORD;
  v_retention_insight JSONB;
  v_hook_insight JSONB;
  v_safety_insight JSONB;
  v_result JSONB;
BEGIN
  -- Verify ownership (if user_id provided)
  IF p_user_id IS NOT NULL THEN
    SELECT * INTO v_reel
    FROM public.reels
    WHERE id = p_reel_id
      AND author_id = p_user_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'not_authorized');
    END IF;
  END IF;

  -- Calculate all insights
  v_retention_insight := public.calculate_retention_insight_v1(p_reel_id);
  v_hook_insight := public.calculate_hook_insight_v1(p_reel_id);
  v_safety_insight := public.calculate_safety_insight_v1(p_reel_id);

  -- Build result
  v_result := jsonb_build_object(
    'reel_id', p_reel_id,
    'insights', jsonb_build_array(
      v_retention_insight,
      v_hook_insight,
      v_safety_insight
    ),
    'generated_at', now()
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_reel_insights_v1(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reel_insights_v1(UUID, UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_reel_insights_v1(UUID, UUID) IS
  'Phase 1 EPIC J: Get all insights for a reel (retention, hook, safety)';

-- 5) Get creator recommendations (top opportunities)

CREATE OR REPLACE FUNCTION public.get_creator_recommendations_v1(
  p_creator_id UUID,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  reel_id UUID,
  opportunity_type TEXT,
  priority INTEGER,
  hint TEXT,
  metrics JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Find reels with low retention (high potential improvement)
  RETURN QUERY
  SELECT
    rm.reel_id,
    'retention'::TEXT AS opportunity_type,
    1 AS priority,
    'Низкая досматриваемость — улучшите динамику контента'::TEXT AS hint,
    jsonb_build_object(
      'watched_rate', ROUND(rm.watched_rate, 1),
      'impressions', rm.impressions,
      'view_starts', rm.view_starts
    ) AS metrics
  FROM public.reel_metrics rm
  JOIN public.reels r ON r.id = rm.reel_id
  WHERE rm.author_id = p_creator_id
    AND rm.watched_rate < 30.0
    AND rm.view_starts >= 20
    AND r.created_at >= (now() - INTERVAL '30 days')
  ORDER BY rm.impressions DESC
  LIMIT GREATEST(1, LEAST(p_limit, 10));

  -- Find reels with low hook (high potential impressions)
  RETURN QUERY
  SELECT
    rm.reel_id,
    'hook'::TEXT AS opportunity_type,
    2 AS priority,
    'Низкий процент начала просмотров — улучшите первый кадр'::TEXT AS hint,
    jsonb_build_object(
      'view_start_rate', ROUND((rm.view_starts::NUMERIC / NULLIF(rm.impressions, 0)::NUMERIC) * 100, 1),
      'impressions', rm.impressions,
      'view_starts', rm.view_starts
    ) AS metrics
  FROM public.reel_metrics rm
  JOIN public.reels r ON r.id = rm.reel_id
  WHERE rm.author_id = p_creator_id
    AND rm.impressions >= 50
    AND (rm.view_starts::NUMERIC / NULLIF(rm.impressions, 0)::NUMERIC) < 0.40
    AND r.created_at >= (now() - INTERVAL '30 days')
  ORDER BY rm.impressions DESC
  LIMIT GREATEST(1, LEAST(p_limit, 10));
END;
$$;

REVOKE ALL ON FUNCTION public.get_creator_recommendations_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_creator_recommendations_v1(UUID, INTEGER) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_creator_recommendations_v1(UUID, INTEGER) IS
  'Phase 1 EPIC J: Get top improvement opportunities for a creator';

-- 6) Get creator growth trends (time-series from snapshots)

CREATE OR REPLACE FUNCTION public.get_creator_growth_v1(
  p_creator_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  snapshot_date DATE,
  total_reels BIGINT,
  total_impressions BIGINT,
  avg_watched_rate NUMERIC,
  total_followers BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cms.snapshot_date,
    cms.total_reels,
    cms.total_impressions,
    cms.avg_watched_rate,
    cms.total_followers
  FROM public.creator_metrics_snapshots cms
  WHERE cms.creator_id = p_creator_id
    AND cms.snapshot_date >= (CURRENT_DATE - INTERVAL '1 day' * GREATEST(1, LEAST(p_days, 180)))
  ORDER BY cms.snapshot_date DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_creator_growth_v1(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_creator_growth_v1(UUID, INTEGER) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_creator_growth_v1(UUID, INTEGER) IS
  'Phase 1 EPIC J: Get creator growth trends over time (daily snapshots)';

-- 7) Create daily snapshot for creator metrics

CREATE OR REPLACE FUNCTION public.create_creator_metrics_snapshot_v1(
  p_creator_id UUID,
  p_snapshot_date DATE DEFAULT CURRENT_DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metrics public.creator_metrics%ROWTYPE;
BEGIN
  SELECT * INTO v_metrics
  FROM public.creator_metrics
  WHERE creator_id = p_creator_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.creator_metrics_snapshots (
    creator_id,
    snapshot_date,
    total_reels,
    total_impressions,
    total_unique_viewers,
    total_view_starts,
    total_watched,
    total_likes,
    total_comments,
    total_saves,
    total_shares,
    total_hides,
    total_not_interested,
    total_reports,
    avg_watched_rate,
    avg_watch_seconds,
    avg_impressions_per_reel,
    total_followers,
    followers_growth_7d,
    followers_growth_30d
  ) VALUES (
    v_metrics.creator_id,
    p_snapshot_date,
    v_metrics.total_reels,
    v_metrics.total_impressions,
    v_metrics.total_unique_viewers,
    v_metrics.total_view_starts,
    v_metrics.total_watched,
    v_metrics.total_likes,
    v_metrics.total_comments,
    v_metrics.total_saves,
    v_metrics.total_shares,
    v_metrics.total_hides,
    v_metrics.total_not_interested,
    v_metrics.total_reports,
    v_metrics.avg_watched_rate,
    v_metrics.avg_watch_seconds,
    v_metrics.avg_impressions_per_reel,
    v_metrics.total_followers,
    v_metrics.followers_growth_7d,
    v_metrics.followers_growth_30d
  )
  ON CONFLICT (creator_id, snapshot_date)
  DO UPDATE SET
    total_reels = EXCLUDED.total_reels,
    total_impressions = EXCLUDED.total_impressions,
    total_unique_viewers = EXCLUDED.total_unique_viewers,
    total_view_starts = EXCLUDED.total_view_starts,
    total_watched = EXCLUDED.total_watched,
    total_likes = EXCLUDED.total_likes,
    total_comments = EXCLUDED.total_comments,
    total_saves = EXCLUDED.total_saves,
    total_shares = EXCLUDED.total_shares,
    total_hides = EXCLUDED.total_hides,
    total_not_interested = EXCLUDED.total_not_interested,
    total_reports = EXCLUDED.total_reports,
    avg_watched_rate = EXCLUDED.avg_watched_rate,
    avg_watch_seconds = EXCLUDED.avg_watch_seconds,
    avg_impressions_per_reel = EXCLUDED.avg_impressions_per_reel,
    total_followers = EXCLUDED.total_followers,
    followers_growth_7d = EXCLUDED.followers_growth_7d,
    followers_growth_30d = EXCLUDED.followers_growth_30d;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.create_creator_metrics_snapshot_v1(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_creator_metrics_snapshot_v1(UUID, DATE) TO service_role;

COMMENT ON FUNCTION public.create_creator_metrics_snapshot_v1(UUID, DATE) IS
  'Phase 1 EPIC J: Create daily snapshot of creator metrics for growth tracking';

-- 8) Background worker: Batch create creator snapshots

CREATE OR REPLACE FUNCTION public.batch_create_creator_snapshots_v1(
  p_snapshot_date DATE DEFAULT CURRENT_DATE,
  p_limit INTEGER DEFAULT 1000
)
RETURNS TABLE (
  creator_id UUID,
  snapshot_date DATE,
  total_reels BIGINT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id UUID;
BEGIN
  FOR v_creator_id IN
    SELECT cm.creator_id
    FROM public.creator_metrics cm
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.creator_metrics_snapshots cms
      WHERE cms.creator_id = cm.creator_id
        AND cms.snapshot_date = p_snapshot_date
    )
    LIMIT GREATEST(1, LEAST(p_limit, 10000))
  LOOP
    PERFORM public.create_creator_metrics_snapshot_v1(v_creator_id, p_snapshot_date);
    
    RETURN QUERY
    SELECT
      cms.creator_id,
      cms.snapshot_date,
      cms.total_reels
    FROM public.creator_metrics_snapshots cms
    WHERE cms.creator_id = v_creator_id
      AND cms.snapshot_date = p_snapshot_date;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.batch_create_creator_snapshots_v1(DATE, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_create_creator_snapshots_v1(DATE, INTEGER) TO service_role;

COMMENT ON FUNCTION public.batch_create_creator_snapshots_v1(DATE, INTEGER) IS
  'Phase 1 EPIC J: Background worker to create daily snapshots for all creators (run daily)';

-- ============================================================================
-- Summary:
-- - ✅ calculate_retention_insight_v1(reel_id): Detect low watched_rate
-- - ✅ calculate_hook_insight_v1(reel_id): Detect low view_start_rate
-- - ✅ calculate_safety_insight_v1(reel_id): Detect high report rate
-- - ✅ get_reel_insights_v1(reel_id, user_id): Get all insights for a reel
-- - ✅ get_creator_recommendations_v1(creator_id, limit): Top opportunities
-- - ✅ get_creator_growth_v1(creator_id, days): Time-series growth trends
-- - ✅ create_creator_metrics_snapshot_v1(creator_id, date): Daily snapshot
-- - ✅ batch_create_creator_snapshots_v1(date, limit): Background worker
-- ============================================================================
