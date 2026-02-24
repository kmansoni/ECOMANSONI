-- ============================================================================
-- Phase 1 EPIC J Part 2: Creator Analytics - Aggregation Functions
--
-- Goals:
-- - Calculate per-reel metrics from validated events
-- - Calculate creator dashboard metrics
-- - Background workers to update metrics (nearline)
-- - Daily snapshot creation
--
-- Based on: docs/specs/phase1/P1J-creator-analytics-v1.md
-- ============================================================================

-- 1) Calculate per-reel metrics from events

CREATE OR REPLACE FUNCTION public.calculate_reel_metrics_v1(
  p_reel_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reel RECORD;
  v_impressions BIGINT;
  v_unique_viewers BIGINT;
  v_view_starts BIGINT;
  v_viewed_2s BIGINT;
  v_watched BIGINT;
  v_watched_rate NUMERIC;
  v_total_watch_seconds BIGINT;
  v_avg_watch_seconds NUMERIC;
  v_distribution_source JSONB;
  v_distribution_reason JSONB;
BEGIN
  -- Get reel info
  SELECT * INTO v_reel
  FROM public.reels
  WHERE id = p_reel_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Calculate reach metrics
  -- impressions: From playback_events (impressions = served events)
  SELECT COUNT(*) INTO v_impressions
  FROM public.playback_events
  WHERE reel_id = p_reel_id
    AND event_type IN ('impression', 'served');

  -- unique_viewers: Distinct users who had impressions
  SELECT COUNT(DISTINCT user_id) INTO v_unique_viewers
  FROM public.playback_events
  WHERE reel_id = p_reel_id
    AND event_type IN ('impression', 'served')
    AND user_id IS NOT NULL;

  -- Watch quality metrics
  -- view_starts: start, play events
  SELECT COUNT(*) INTO v_view_starts
  FROM public.playback_events
  WHERE reel_id = p_reel_id
    AND event_type IN ('start', 'play');

  -- viewed_2s: watched >= 2 seconds
  SELECT COUNT(*) INTO v_viewed_2s
  FROM public.playback_events
  WHERE reel_id = p_reel_id
    AND event_type = 'progress'
    AND (metadata->>'watch_duration_ms')::INTEGER >= 2000;

  -- watched: completed watch (Phase 0 rule: >= 50% or >= 3 seconds)
  SELECT COUNT(*) INTO v_watched
  FROM public.playback_events
  WHERE reel_id = p_reel_id
    AND event_type = 'complete';

  -- total_watch_seconds
  SELECT COALESCE(SUM((metadata->>'watch_duration_ms')::INTEGER / 1000.0), 0) INTO v_total_watch_seconds
  FROM public.playback_events
  WHERE reel_id = p_reel_id
    AND event_type = 'progress'
    AND metadata ? 'watch_duration_ms';

  -- avg_watch_seconds
  IF v_view_starts > 0 THEN
    v_avg_watch_seconds := v_total_watch_seconds::NUMERIC / v_view_starts::NUMERIC;
  ELSE
    v_avg_watch_seconds := 0;
  END IF;

  -- watched_rate
  IF v_view_starts > 0 THEN
    v_watched_rate := (v_watched::NUMERIC / v_view_starts::NUMERIC) * 100;
  ELSE
    v_watched_rate := 0;
  END IF;

  -- Distribution by source (from ranking_explanations)
  SELECT COALESCE(jsonb_object_agg(source_pool, cnt), '{}'::JSONB)
  INTO v_distribution_source
  FROM (
    SELECT
      COALESCE(source_pool, 'unknown') AS source_pool,
      COUNT(*) AS cnt
    FROM public.ranking_explanations
    WHERE reel_id = p_reel_id
    GROUP BY source_pool
  ) src;

  -- Distribution by reason (top 5 reason codes)
  SELECT COALESCE(jsonb_object_agg(reason_code, cnt), '{}'::JSONB)
  INTO v_distribution_reason
  FROM (
    SELECT
      unnest(reason_codes) AS reason_code,
      COUNT(*) AS cnt
    FROM public.ranking_explanations
    WHERE reel_id = p_reel_id
    GROUP BY reason_code
    ORDER BY cnt DESC
    LIMIT 5
  ) reasons;

  -- Upsert reel_metrics
  INSERT INTO public.reel_metrics (
    reel_id,
    author_id,
    impressions,
    unique_viewers,
    view_starts,
    viewed_2s,
    watched,
    watched_rate,
    avg_watch_seconds,
    total_watch_seconds,
    likes,
    comments,
    saves,
    shares,
    hides,
    not_interested,
    reports,
    distribution_by_source,
    distribution_by_reason,
    last_updated_at
  ) VALUES (
    p_reel_id,
    v_reel.author_id,
    v_impressions,
    v_unique_viewers,
    v_view_starts,
    v_viewed_2s,
    v_watched,
    v_watched_rate,
    v_avg_watch_seconds,
    v_total_watch_seconds,
    COALESCE(v_reel.likes_count, 0),
    COALESCE(v_reel.comments_count, 0),
    COALESCE((SELECT COUNT(*) FROM public.saves WHERE reel_id = p_reel_id), 0),
    COALESCE((SELECT COUNT(*) FROM public.shares WHERE reel_id = p_reel_id), 0),
    COALESCE((SELECT COUNT(*) FROM public.user_flags WHERE reel_id = p_reel_id AND flag_type = 'hide'), 0),
    COALESCE((SELECT COUNT(*) FROM public.user_flags WHERE reel_id = p_reel_id AND flag_type = 'not_interested'), 0),
    COALESCE((SELECT COUNT(*) FROM public.reports WHERE reel_id = p_reel_id), 0),
    v_distribution_source,
    v_distribution_reason,
    now()
  )
  ON CONFLICT (reel_id)
  DO UPDATE SET
    impressions = EXCLUDED.impressions,
    unique_viewers = EXCLUDED.unique_viewers,
    view_starts = EXCLUDED.view_starts,
    viewed_2s = EXCLUDED.viewed_2s,
    watched = EXCLUDED.watched,
    watched_rate = EXCLUDED.watched_rate,
    avg_watch_seconds = EXCLUDED.avg_watch_seconds,
    total_watch_seconds = EXCLUDED.total_watch_seconds,
    likes = EXCLUDED.likes,
    comments = EXCLUDED.comments,
    saves = EXCLUDED.saves,
    shares = EXCLUDED.shares,
    hides = EXCLUDED.hides,
    not_interested = EXCLUDED.not_interested,
    reports = EXCLUDED.reports,
    distribution_by_source = EXCLUDED.distribution_by_source,
    distribution_by_reason = EXCLUDED.distribution_by_reason,
    last_updated_at = EXCLUDED.last_updated_at;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_reel_metrics_v1(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_reel_metrics_v1(UUID) TO service_role;

COMMENT ON FUNCTION public.calculate_reel_metrics_v1(UUID) IS
  'Phase 1 EPIC J: Calculate and update per-reel metrics from validated events';

-- 2) Background worker: Batch calculate reel metrics

CREATE OR REPLACE FUNCTION public.batch_calculate_reel_metrics_v1(
  p_limit INTEGER DEFAULT 100,
  p_max_age_hours INTEGER DEFAULT 72
)
RETURNS TABLE (
  reel_id UUID,
  author_id UUID,
  impressions BIGINT,
  watched_rate NUMERIC,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reel RECORD;
BEGIN
  -- Find reels that need metrics update
  -- Priority: new reels (< 72h old) or reels with recent activity
  FOR v_reel IN
    SELECT r.id, r.author_id
    FROM public.reels r
    WHERE r.created_at >= (now() - make_interval(hours => COALESCE(p_max_age_hours, 72)))
      AND r.moderation_status IS DISTINCT FROM 'blocked'
    ORDER BY r.created_at DESC
    LIMIT GREATEST(1, LEAST(p_limit, 1000))
  LOOP
    PERFORM public.calculate_reel_metrics_v1(v_reel.id);
    
    -- Return updated metrics
    RETURN QUERY
    SELECT
      rm.reel_id,
      rm.author_id,
      rm.impressions,
      rm.watched_rate,
      rm.last_updated_at
    FROM public.reel_metrics rm
    WHERE rm.reel_id = v_reel.id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.batch_calculate_reel_metrics_v1(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_calculate_reel_metrics_v1(INTEGER, INTEGER) TO service_role;

COMMENT ON FUNCTION public.batch_calculate_reel_metrics_v1(INTEGER, INTEGER) IS
  'Phase 1 EPIC J: Background worker to batch calculate reel metrics (run every 15-30 min)';

-- 3) Create daily snapshot for reel metrics

CREATE OR REPLACE FUNCTION public.create_reel_metrics_snapshot_v1(
  p_reel_id UUID,
  p_snapshot_date DATE DEFAULT CURRENT_DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metrics public.reel_metrics%ROWTYPE;
BEGIN
  SELECT * INTO v_metrics
  FROM public.reel_metrics
  WHERE reel_id = p_reel_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.reel_metrics_snapshots (
    reel_id,
    author_id,
    snapshot_date,
    impressions,
    unique_viewers,
    view_starts,
    viewed_2s,
    watched,
    watched_rate,
    avg_watch_seconds,
    total_watch_seconds,
    likes,
    comments,
    saves,
    shares,
    hides,
    not_interested,
    reports,
    distribution_by_source,
    distribution_by_reason
  ) VALUES (
    v_metrics.reel_id,
    v_metrics.author_id,
    p_snapshot_date,
    v_metrics.impressions,
    v_metrics.unique_viewers,
    v_metrics.view_starts,
    v_metrics.viewed_2s,
    v_metrics.watched,
    v_metrics.watched_rate,
    v_metrics.avg_watch_seconds,
    v_metrics.total_watch_seconds,
    v_metrics.likes,
    v_metrics.comments,
    v_metrics.saves,
    v_metrics.shares,
    v_metrics.hides,
    v_metrics.not_interested,
    v_metrics.reports,
    v_metrics.distribution_by_source,
    v_metrics.distribution_by_reason
  )
  ON CONFLICT (reel_id, snapshot_date)
  DO UPDATE SET
    impressions = EXCLUDED.impressions,
    unique_viewers = EXCLUDED.unique_viewers,
    view_starts = EXCLUDED.view_starts,
    viewed_2s = EXCLUDED.viewed_2s,
    watched = EXCLUDED.watched,
    watched_rate = EXCLUDED.watched_rate,
    avg_watch_seconds = EXCLUDED.avg_watch_seconds,
    total_watch_seconds = EXCLUDED.total_watch_seconds,
    likes = EXCLUDED.likes,
    comments = EXCLUDED.comments,
    saves = EXCLUDED.saves,
    shares = EXCLUDED.shares,
    hides = EXCLUDED.hides,
    not_interested = EXCLUDED.not_interested,
    reports = EXCLUDED.reports,
    distribution_by_source = EXCLUDED.distribution_by_source,
    distribution_by_reason = EXCLUDED.distribution_by_reason;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.create_reel_metrics_snapshot_v1(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_reel_metrics_snapshot_v1(UUID, DATE) TO service_role;

COMMENT ON FUNCTION public.create_reel_metrics_snapshot_v1(UUID, DATE) IS
  'Phase 1 EPIC J: Create daily snapshot of reel metrics for time-series analytics';

-- 4) Background worker: Batch create daily snapshots

CREATE OR REPLACE FUNCTION public.batch_create_reel_snapshots_v1(
  p_snapshot_date DATE DEFAULT CURRENT_DATE,
  p_limit INTEGER DEFAULT 1000
)
RETURNS TABLE (
  reel_id UUID,
  snapshot_date DATE,
  impressions BIGINT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reel_id UUID;
BEGIN
  FOR v_reel_id IN
    SELECT rm.reel_id
    FROM public.reel_metrics rm
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.reel_metrics_snapshots rms
      WHERE rms.reel_id = rm.reel_id
        AND rms.snapshot_date = p_snapshot_date
    )
    LIMIT GREATEST(1, LEAST(p_limit, 10000))
  LOOP
    PERFORM public.create_reel_metrics_snapshot_v1(v_reel_id, p_snapshot_date);
    
    RETURN QUERY
    SELECT
      rms.reel_id,
      rms.snapshot_date,
      rms.impressions
    FROM public.reel_metrics_snapshots rms
    WHERE rms.reel_id = v_reel_id
      AND rms.snapshot_date = p_snapshot_date;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.batch_create_reel_snapshots_v1(DATE, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_create_reel_snapshots_v1(DATE, INTEGER) TO service_role;

COMMENT ON FUNCTION public.batch_create_reel_snapshots_v1(DATE, INTEGER) IS
  'Phase 1 EPIC J: Background worker to create daily snapshots for all reels (run daily)';

-- 5) Calculate creator dashboard metrics

CREATE OR REPLACE FUNCTION public.calculate_creator_metrics_v1(
  p_creator_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_totals RECORD;
  v_followers BIGINT;
  v_followers_7d INTEGER;
  v_followers_30d INTEGER;
  v_top_reel RECORD;
BEGIN
  -- Aggregate from reel_metrics
  SELECT
    COUNT(*) AS total_reels,
    SUM(impressions) AS total_impressions,
    SUM(unique_viewers) AS total_unique_viewers,
    SUM(view_starts) AS total_view_starts,
    SUM(watched) AS total_watched,
    SUM(likes) AS total_likes,
    SUM(comments) AS total_comments,
    SUM(saves) AS total_saves,
    SUM(shares) AS total_shares,
    SUM(hides) AS total_hides,
    SUM(not_interested) AS total_not_interested,
    SUM(reports) AS total_reports,
    AVG(watched_rate) AS avg_watched_rate,
    AVG(avg_watch_seconds) AS avg_watch_seconds,
    CASE
      WHEN COUNT(*) > 0 THEN SUM(impressions)::NUMERIC / COUNT(*)::NUMERIC
      ELSE 0
    END AS avg_impressions_per_reel
  INTO v_totals
  FROM public.reel_metrics
  WHERE author_id = p_creator_id;

  -- Get follower counts (if follows table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='follows') THEN
    SELECT COUNT(*) INTO v_followers
    FROM public.follows
    WHERE followed_id = p_creator_id
      AND unfollowed_at IS NULL;

    -- Growth 7d
    SELECT COUNT(*) INTO v_followers_7d
    FROM public.follows
    WHERE followed_id = p_creator_id
      AND created_at >= (now() - INTERVAL '7 days')
      AND unfollowed_at IS NULL;

    -- Growth 30d
    SELECT COUNT(*) INTO v_followers_30d
    FROM public.follows
    WHERE followed_id = p_creator_id
      AND created_at >= (now() - INTERVAL '30 days')
      AND unfollowed_at IS NULL;
  ELSE
    v_followers := 0;
    v_followers_7d := 0;
    v_followers_30d := 0;
  END IF;

  -- Find top performing reel
  SELECT reel_id, impressions
  INTO v_top_reel
  FROM public.reel_metrics
  WHERE author_id = p_creator_id
  ORDER BY impressions DESC
  LIMIT 1;

  -- Upsert creator_metrics
  INSERT INTO public.creator_metrics (
    creator_id,
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
    followers_growth_30d,
    top_reel_id,
    top_reel_impressions,
    last_updated_at
  ) VALUES (
    p_creator_id,
    COALESCE(v_totals.total_reels, 0),
    COALESCE(v_totals.total_impressions, 0),
    COALESCE(v_totals.total_unique_viewers, 0),
    COALESCE(v_totals.total_view_starts, 0),
    COALESCE(v_totals.total_watched, 0),
    COALESCE(v_totals.total_likes, 0),
    COALESCE(v_totals.total_comments, 0),
    COALESCE(v_totals.total_saves, 0),
    COALESCE(v_totals.total_shares, 0),
    COALESCE(v_totals.total_hides, 0),
    COALESCE(v_totals.total_not_interested, 0),
    COALESCE(v_totals.total_reports, 0),
    ROUND(COALESCE(v_totals.avg_watched_rate, 0), 2),
    ROUND(COALESCE(v_totals.avg_watch_seconds, 0), 2),
    ROUND(COALESCE(v_totals.avg_impressions_per_reel, 0), 2),
    COALESCE(v_followers, 0),
    COALESCE(v_followers_7d, 0),
    COALESCE(v_followers_30d, 0),
    v_top_reel.reel_id,
    COALESCE(v_top_reel.impressions, 0),
    now()
  )
  ON CONFLICT (creator_id)
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
    followers_growth_30d = EXCLUDED.followers_growth_30d,
    top_reel_id = EXCLUDED.top_reel_id,
    top_reel_impressions = EXCLUDED.top_reel_impressions,
    last_updated_at = EXCLUDED.last_updated_at;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_creator_metrics_v1(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_creator_metrics_v1(UUID) TO service_role;

COMMENT ON FUNCTION public.calculate_creator_metrics_v1(UUID) IS
  'Phase 1 EPIC J: Calculate and update creator dashboard metrics';

-- 6) Background worker: Batch calculate creator metrics

CREATE OR REPLACE FUNCTION public.batch_calculate_creator_metrics_v1(
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  creator_id UUID,
  total_reels BIGINT,
  total_impressions BIGINT,
  avg_watched_rate NUMERIC
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
    SELECT DISTINCT author_id
    FROM public.reel_metrics
    LIMIT GREATEST(1, LEAST(p_limit, 1000))
  LOOP
    PERFORM public.calculate_creator_metrics_v1(v_creator_id);
    
    RETURN QUERY
    SELECT
      cm.creator_id,
      cm.total_reels,
      cm.total_impressions,
      cm.avg_watched_rate
    FROM public.creator_metrics cm
    WHERE cm.creator_id = v_creator_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.batch_calculate_creator_metrics_v1(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_calculate_creator_metrics_v1(INTEGER) TO service_role;

COMMENT ON FUNCTION public.batch_calculate_creator_metrics_v1(INTEGER) IS
  'Phase 1 EPIC J: Background worker to batch calculate creator dashboard metrics (run hourly)';

-- ============================================================================
-- Summary:
-- - ✅ calculate_reel_metrics_v1(reel_id): Calculate per-reel metrics from events
-- - ✅ batch_calculate_reel_metrics_v1(limit, max_age_hours): Background worker (run every 15-30 min)
-- - ✅ create_reel_metrics_snapshot_v1(reel_id, date): Create daily snapshot
-- - ✅ batch_create_reel_snapshots_v1(date, limit): Background worker (run daily)
-- - ✅ calculate_creator_metrics_v1(creator_id): Calculate creator dashboard
-- - ✅ batch_calculate_creator_metrics_v1(limit): Background worker (run hourly)
-- ============================================================================
