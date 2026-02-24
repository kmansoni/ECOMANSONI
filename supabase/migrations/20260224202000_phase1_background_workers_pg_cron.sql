-- ============================================================================
-- Phase 1: Background workers scheduling (pg_cron)
--
-- Schedules critical workers for Phase 1 EPICs:
-- - EPIC H: trending hashtags updater + cleanup + coordinated attack detection
-- - EPIC I: controversial amplification scanner + diversity analyzer
-- - EPIC J: reel/creator metrics aggregation + daily snapshots
--
-- Idempotent: only schedules jobs if missing.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Wrapper: run coordinated-attack detection across top hashtags (since detect_coordinated_hashtag_attack_v1 requires a tag)
CREATE OR REPLACE FUNCTION public.batch_detect_coordinated_hashtag_attacks_v1(
  p_limit INTEGER DEFAULT 50,
  p_window_hours INTEGER DEFAULT 24,
  p_similarity_threshold NUMERIC DEFAULT 0.8
)
RETURNS TABLE (
  hashtag_tag TEXT,
  is_suspicious BOOLEAN,
  suspicious_account_count INTEGER,
  similar_pattern_count INTEGER,
  velocity_spike_detected BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tag TEXT;
BEGIN
  FOR v_tag IN
    SELECT h.tag
    FROM public.hashtags h
    WHERE h.status = 'normal'
    ORDER BY COALESCE(h.is_trending, false) DESC, COALESCE(h.velocity_score, 0) DESC, COALESCE(h.usage_count, 0) DESC
    LIMIT GREATEST(1, LEAST(p_limit, 200))
  LOOP
    RETURN QUERY
    SELECT
      v_tag AS hashtag_tag,
      d.is_suspicious,
      d.suspicious_account_count,
      d.similar_pattern_count,
      d.velocity_spike_detected
    FROM public.detect_coordinated_hashtag_attack_v1(v_tag, p_window_hours, p_similarity_threshold) d;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.batch_detect_coordinated_hashtag_attacks_v1(INTEGER, INTEGER, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_detect_coordinated_hashtag_attacks_v1(INTEGER, INTEGER, NUMERIC) TO service_role;

DO $do$
BEGIN
  -- EPIC H
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'phase1-h-trending-update') THEN
    PERFORM cron.schedule(
      'phase1-h-trending-update',
      '*/20 * * * *',
      $cron$SELECT public.batch_update_trending_hashtags_v1(24, 200)$cron$
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'phase1-h-hashtag-attack-detect') THEN
    PERFORM cron.schedule(
      'phase1-h-hashtag-attack-detect',
      '5 * * * *',
      $cron$SELECT public.batch_detect_coordinated_hashtag_attacks_v1(50, 24, 0.8)$cron$
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'phase1-h-trending-cleanup') THEN
    PERFORM cron.schedule(
      'phase1-h-trending-cleanup',
      '0 2 * * *',
      $cron$SELECT public.cleanup_trending_hashtags_v1(7)$cron$
    );
  END IF;

  -- EPIC I
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'phase1-i-controversial-check') THEN
    PERFORM cron.schedule(
      'phase1-i-controversial-check',
      '10 * * * *',
      $cron$SELECT public.batch_check_controversial_v1(500, 1000)$cron$
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'phase1-i-diversity-analyze') THEN
    PERFORM cron.schedule(
      'phase1-i-diversity-analyze',
      '20 */6 * * *',
      $cron$SELECT public.batch_analyze_diversity_v1(1000)$cron$
    );
  END IF;

  -- EPIC J
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'phase1-j-reel-metrics') THEN
    PERFORM cron.schedule(
      'phase1-j-reel-metrics',
      '*/20 * * * *',
      $cron$SELECT public.batch_calculate_reel_metrics_v1(200, 72)$cron$
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'phase1-j-creator-metrics') THEN
    PERFORM cron.schedule(
      'phase1-j-creator-metrics',
      '25 * * * *',
      $cron$SELECT public.batch_calculate_creator_metrics_v1(200)$cron$
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'phase1-j-reel-snapshots') THEN
    PERFORM cron.schedule(
      'phase1-j-reel-snapshots',
      '30 0 * * *',
      $cron$SELECT public.batch_create_reel_snapshots_v1(CURRENT_DATE, 10000)$cron$
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'phase1-j-creator-snapshots') THEN
    PERFORM cron.schedule(
      'phase1-j-creator-snapshots',
      '0 1 * * *',
      $cron$SELECT public.batch_create_creator_snapshots_v1(CURRENT_DATE, 10000)$cron$
    );
  END IF;
END $do$;

-- ============================================================================
-- Notes:
-- - Job arguments are conservative defaults; tune after observing runtime.
-- - All scheduled functions must be SECURITY DEFINER / service-only safe.
-- ============================================================================
