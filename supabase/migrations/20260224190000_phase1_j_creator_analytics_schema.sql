-- ============================================================================
-- Phase 1 EPIC J Part 1: Creator Analytics - Metrics Schema
--
-- Goals:
-- - Track per-reel metrics (reach, watch quality, satisfaction, negative signals)
-- - Track creator dashboard metrics (aggregates across all reels)
-- - Track daily snapshots for time-series analytics
-- - Only count validated events (event integrity)
--
-- Metrics (from P1J spec):
-- - Reach: impressions, unique_viewers
-- - Watch quality: view_starts, viewed_2s, watched, watched_rate, avg_watch_seconds
-- - Satisfaction: likes, comments, saves, shares
-- - Negative: hides, not_interested, reports
-- - Distribution: by source_pool/reason codes
--
-- Based on: docs/specs/phase1/P1J-creator-analytics-v1.md
-- ============================================================================

-- 1) Per-reel metrics (nearline aggregates)
-- Updated every N minutes by background worker

CREATE TABLE IF NOT EXISTS public.reel_metrics (
  reel_id UUID PRIMARY KEY REFERENCES public.reels(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  
  -- Reach
  impressions BIGINT NOT NULL DEFAULT 0,
  unique_viewers BIGINT NOT NULL DEFAULT 0,
  
  -- Watch quality
  view_starts BIGINT NOT NULL DEFAULT 0,
  viewed_2s BIGINT NOT NULL DEFAULT 0,
  watched BIGINT NOT NULL DEFAULT 0,
  watched_rate NUMERIC(5,2) NOT NULL DEFAULT 0.0 CHECK (watched_rate >= 0 AND watched_rate <= 100),
  avg_watch_seconds NUMERIC(8,2) NOT NULL DEFAULT 0.0,
  total_watch_seconds BIGINT NOT NULL DEFAULT 0,
  
  -- Satisfaction
  likes BIGINT NOT NULL DEFAULT 0,
  comments BIGINT NOT NULL DEFAULT 0,
  saves BIGINT NOT NULL DEFAULT 0,
  shares BIGINT NOT NULL DEFAULT 0,
  
  -- Negative signals
  hides BIGINT NOT NULL DEFAULT 0,
  not_interested BIGINT NOT NULL DEFAULT 0,
  reports BIGINT NOT NULL DEFAULT 0,
  
  -- Distribution breakdown (JSONB for flexibility)
  distribution_by_source JSONB NOT NULL DEFAULT '{}'::JSONB,
  distribution_by_reason JSONB NOT NULL DEFAULT '{}'::JSONB,
  
  -- Metadata
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reel_metrics_author
  ON public.reel_metrics(author_id, last_updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_reel_metrics_impressions
  ON public.reel_metrics(impressions DESC);

CREATE INDEX IF NOT EXISTS idx_reel_metrics_watched_rate
  ON public.reel_metrics(watched_rate DESC);

COMMENT ON TABLE public.reel_metrics IS
  'Phase 1 EPIC J: Nearline per-reel metrics aggregates (updated every N minutes by background worker)';

-- 2) Reel metrics daily snapshots (for time-series analytics)

CREATE TABLE IF NOT EXISTS public.reel_metrics_snapshots (
  snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  
  -- Same metrics as reel_metrics
  impressions BIGINT NOT NULL DEFAULT 0,
  unique_viewers BIGINT NOT NULL DEFAULT 0,
  view_starts BIGINT NOT NULL DEFAULT 0,
  viewed_2s BIGINT NOT NULL DEFAULT 0,
  watched BIGINT NOT NULL DEFAULT 0,
  watched_rate NUMERIC(5,2) NOT NULL DEFAULT 0.0,
  avg_watch_seconds NUMERIC(8,2) NOT NULL DEFAULT 0.0,
  total_watch_seconds BIGINT NOT NULL DEFAULT 0,
  likes BIGINT NOT NULL DEFAULT 0,
  comments BIGINT NOT NULL DEFAULT 0,
  saves BIGINT NOT NULL DEFAULT 0,
  shares BIGINT NOT NULL DEFAULT 0,
  hides BIGINT NOT NULL DEFAULT 0,
  not_interested BIGINT NOT NULL DEFAULT 0,
  reports BIGINT NOT NULL DEFAULT 0,
  distribution_by_source JSONB NOT NULL DEFAULT '{}'::JSONB,
  distribution_by_reason JSONB NOT NULL DEFAULT '{}'::JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(reel_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_reel_metrics_snapshots_reel
  ON public.reel_metrics_snapshots(reel_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_reel_metrics_snapshots_author
  ON public.reel_metrics_snapshots(author_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_reel_metrics_snapshots_date
  ON public.reel_metrics_snapshots(snapshot_date DESC);

COMMENT ON TABLE public.reel_metrics_snapshots IS
  'Phase 1 EPIC J: Daily snapshots of reel metrics for time-series analytics (24h/7d/30d windows)';

-- 3) Creator dashboard metrics (aggregates across all reels)

CREATE TABLE IF NOT EXISTS public.creator_metrics (
  creator_id UUID PRIMARY KEY,
  
  -- Totals (across all reels)
  total_reels BIGINT NOT NULL DEFAULT 0,
  total_impressions BIGINT NOT NULL DEFAULT 0,
  total_unique_viewers BIGINT NOT NULL DEFAULT 0,
  total_view_starts BIGINT NOT NULL DEFAULT 0,
  total_watched BIGINT NOT NULL DEFAULT 0,
  total_likes BIGINT NOT NULL DEFAULT 0,
  total_comments BIGINT NOT NULL DEFAULT 0,
  total_saves BIGINT NOT NULL DEFAULT 0,
  total_shares BIGINT NOT NULL DEFAULT 0,
  total_hides BIGINT NOT NULL DEFAULT 0,
  total_not_interested BIGINT NOT NULL DEFAULT 0,
  total_reports BIGINT NOT NULL DEFAULT 0,
  
  -- Averages
  avg_watched_rate NUMERIC(5,2) NOT NULL DEFAULT 0.0,
  avg_watch_seconds NUMERIC(8,2) NOT NULL DEFAULT 0.0,
  avg_impressions_per_reel NUMERIC(10,2) NOT NULL DEFAULT 0.0,
  
  -- Audience growth (if follows exist)
  total_followers BIGINT NOT NULL DEFAULT 0,
  followers_growth_7d INTEGER NOT NULL DEFAULT 0,
  followers_growth_30d INTEGER NOT NULL DEFAULT 0,
  
  -- Top performing reel
  top_reel_id UUID,
  top_reel_impressions BIGINT NOT NULL DEFAULT 0,
  
  -- Metadata
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_metrics_impressions
  ON public.creator_metrics(total_impressions DESC);

CREATE INDEX IF NOT EXISTS idx_creator_metrics_followers
  ON public.creator_metrics(total_followers DESC);

CREATE INDEX IF NOT EXISTS idx_creator_metrics_updated
  ON public.creator_metrics(last_updated_at DESC);

COMMENT ON TABLE public.creator_metrics IS
  'Phase 1 EPIC J: Creator dashboard metrics (aggregates across all creator reels)';

-- 4) Creator metrics daily snapshots

CREATE TABLE IF NOT EXISTS public.creator_metrics_snapshots (
  snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  
  -- Same metrics as creator_metrics
  total_reels BIGINT NOT NULL DEFAULT 0,
  total_impressions BIGINT NOT NULL DEFAULT 0,
  total_unique_viewers BIGINT NOT NULL DEFAULT 0,
  total_view_starts BIGINT NOT NULL DEFAULT 0,
  total_watched BIGINT NOT NULL DEFAULT 0,
  total_likes BIGINT NOT NULL DEFAULT 0,
  total_comments BIGINT NOT NULL DEFAULT 0,
  total_saves BIGINT NOT NULL DEFAULT 0,
  total_shares BIGINT NOT NULL DEFAULT 0,
  total_hides BIGINT NOT NULL DEFAULT 0,
  total_not_interested BIGINT NOT NULL DEFAULT 0,
  total_reports BIGINT NOT NULL DEFAULT 0,
  avg_watched_rate NUMERIC(5,2) NOT NULL DEFAULT 0.0,
  avg_watch_seconds NUMERIC(8,2) NOT NULL DEFAULT 0.0,
  avg_impressions_per_reel NUMERIC(10,2) NOT NULL DEFAULT 0.0,
  total_followers BIGINT NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(creator_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_creator_metrics_snapshots_creator
  ON public.creator_metrics_snapshots(creator_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_creator_metrics_snapshots_date
  ON public.creator_metrics_snapshots(snapshot_date DESC);

COMMENT ON TABLE public.creator_metrics_snapshots IS
  'Phase 1 EPIC J: Daily snapshots of creator metrics for growth tracking';

-- 5) Helper function: Get reel metrics with time windows

CREATE OR REPLACE FUNCTION public.get_reel_metrics_v1(
  p_reel_id UUID,
  p_window TEXT DEFAULT 'all' -- 'all', '24h', '7d', '30d'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current public.reel_metrics%ROWTYPE;
  v_window_start DATE;
  v_window_metrics RECORD;
  v_result JSONB;
BEGIN
  -- Get current metrics
  SELECT * INTO v_current
  FROM public.reel_metrics
  WHERE reel_id = p_reel_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'reel_id', p_reel_id::TEXT,
      'error', 'No metrics found'
    );
  END IF;

  -- Parse window
  IF p_window = '24h' THEN
    v_window_start := CURRENT_DATE;
  ELSIF p_window = '7d' THEN
    v_window_start := CURRENT_DATE - INTERVAL '6 days';
  ELSIF p_window = '30d' THEN
    v_window_start := CURRENT_DATE - INTERVAL '29 days';
  ELSE
    -- 'all' - use current metrics
    v_result := jsonb_build_object(
      'reel_id', v_current.reel_id::TEXT,
      'window', 'all',
      'reach', jsonb_build_object(
        'impressions', v_current.impressions,
        'unique_viewers', v_current.unique_viewers
      ),
      'watch_quality', jsonb_build_object(
        'view_starts', v_current.view_starts,
        'viewed_2s', v_current.viewed_2s,
        'watched', v_current.watched,
        'watched_rate', v_current.watched_rate,
        'avg_watch_seconds', v_current.avg_watch_seconds
      ),
      'satisfaction', jsonb_build_object(
        'likes', v_current.likes,
        'comments', v_current.comments,
        'saves', v_current.saves,
        'shares', v_current.shares
      ),
      'negative', jsonb_build_object(
        'hides', v_current.hides,
        'not_interested', v_current.not_interested,
        'reports', v_current.reports
      ),
      'distribution', jsonb_build_object(
        'by_source', v_current.distribution_by_source,
        'by_reason', v_current.distribution_by_reason
      ),
      'last_updated_at', to_char(v_current.last_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );
    RETURN v_result;
  END IF;

  -- Aggregate from snapshots for time window
  SELECT
    SUM(impressions) AS impressions,
    SUM(unique_viewers) AS unique_viewers,
    SUM(view_starts) AS view_starts,
    SUM(viewed_2s) AS viewed_2s,
    SUM(watched) AS watched,
    CASE
      WHEN SUM(view_starts) > 0 THEN (SUM(watched)::NUMERIC / SUM(view_starts)::NUMERIC) * 100
      ELSE 0
    END AS watched_rate,
    CASE
      WHEN SUM(view_starts) > 0 THEN SUM(total_watch_seconds)::NUMERIC / SUM(view_starts)::NUMERIC
      ELSE 0
    END AS avg_watch_seconds,
    SUM(likes) AS likes,
    SUM(comments) AS comments,
    SUM(saves) AS saves,
    SUM(shares) AS shares,
    SUM(hides) AS hides,
    SUM(not_interested) AS not_interested,
    SUM(reports) AS reports
  INTO v_window_metrics
  FROM public.reel_metrics_snapshots
  WHERE reel_id = p_reel_id
    AND snapshot_date >= v_window_start;

  v_result := jsonb_build_object(
    'reel_id', p_reel_id::TEXT,
    'window', p_window,
    'reach', jsonb_build_object(
      'impressions', COALESCE(v_window_metrics.impressions, 0),
      'unique_viewers', COALESCE(v_window_metrics.unique_viewers, 0)
    ),
    'watch_quality', jsonb_build_object(
      'view_starts', COALESCE(v_window_metrics.view_starts, 0),
      'viewed_2s', COALESCE(v_window_metrics.viewed_2s, 0),
      'watched', COALESCE(v_window_metrics.watched, 0),
      'watched_rate', ROUND(COALESCE(v_window_metrics.watched_rate, 0), 2),
      'avg_watch_seconds', ROUND(COALESCE(v_window_metrics.avg_watch_seconds, 0), 2)
    ),
    'satisfaction', jsonb_build_object(
      'likes', COALESCE(v_window_metrics.likes, 0),
      'comments', COALESCE(v_window_metrics.comments, 0),
      'saves', COALESCE(v_window_metrics.saves, 0),
      'shares', COALESCE(v_window_metrics.shares, 0)
    ),
    'negative', jsonb_build_object(
      'hides', COALESCE(v_window_metrics.hides, 0),
      'not_interested', COALESCE(v_window_metrics.not_interested, 0),
      'reports', COALESCE(v_window_metrics.reports, 0)
    )
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_reel_metrics_v1(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reel_metrics_v1(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.get_reel_metrics_v1(UUID, TEXT) IS
  'Phase 1 EPIC J: Get reel metrics with time window (all/24h/7d/30d)';

-- 6) Helper function: Get creator dashboard metrics

CREATE OR REPLACE FUNCTION public.get_creator_dashboard_v1(
  p_creator_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metrics public.creator_metrics%ROWTYPE;
  v_result JSONB;
BEGIN
  SELECT * INTO v_metrics
  FROM public.creator_metrics
  WHERE creator_id = p_creator_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'creator_id', p_creator_id::TEXT,
      'error', 'No metrics found'
    );
  END IF;

  v_result := jsonb_build_object(
    'creator_id', v_metrics.creator_id::TEXT,
    'totals', jsonb_build_object(
      'reels', v_metrics.total_reels,
      'impressions', v_metrics.total_impressions,
      'unique_viewers', v_metrics.total_unique_viewers,
      'view_starts', v_metrics.total_view_starts,
      'watched', v_metrics.total_watched,
      'likes', v_metrics.total_likes,
      'comments', v_metrics.total_comments,
      'saves', v_metrics.total_saves,
      'shares', v_metrics.total_shares
    ),
    'averages', jsonb_build_object(
      'watched_rate', v_metrics.avg_watched_rate,
      'watch_seconds', v_metrics.avg_watch_seconds,
      'impressions_per_reel', v_metrics.avg_impressions_per_reel
    ),
    'audience', jsonb_build_object(
      'followers', v_metrics.total_followers,
      'growth_7d', v_metrics.followers_growth_7d,
      'growth_30d', v_metrics.followers_growth_30d
    ),
    'top_reel', jsonb_build_object(
      'reel_id', v_metrics.top_reel_id::TEXT,
      'impressions', v_metrics.top_reel_impressions
    ),
    'last_updated_at', to_char(v_metrics.last_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_creator_dashboard_v1(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_creator_dashboard_v1(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_creator_dashboard_v1(UUID) IS
  'Phase 1 EPIC J: Get creator dashboard metrics (aggregates across all reels)';

-- ============================================================================
-- Summary:
-- - ✅ reel_metrics table (nearline per-reel aggregates)
-- - ✅ reel_metrics_snapshots table (daily snapshots for time-series)
-- - ✅ creator_metrics table (creator dashboard aggregates)
-- - ✅ creator_metrics_snapshots table (daily snapshots for growth tracking)
-- - ✅ get_reel_metrics_v1(reel_id, window) RPC
-- - ✅ get_creator_dashboard_v1(creator_id) RPC
-- ============================================================================
