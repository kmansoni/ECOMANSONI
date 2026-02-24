-- Phase 1 EPIC M: Observability v1 - RPC Functions
-- Purpose: Guardrail evaluation + SLO status + auto-rollback logic
-- Dependencies: 20260224020007_phase1_observability_schema.sql

-- ============================================================================
-- 1) Evaluate Guardrails (record metric + check thresholds + auto-rollback)
-- ============================================================================

CREATE OR REPLACE FUNCTION evaluate_guardrails_v1(
  p_metric_name TEXT,
  p_value NUMERIC,
  p_labels JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_triggered JSONB := '[]'::JSONB;
  v_guardrail RECORD;
  v_avg_value NUMERIC;
  v_breach BOOLEAN;
  v_rollback_count INT := 0;
BEGIN
  -- Store metric sample
  INSERT INTO metrics_samples (metric_name, value, labels)
  VALUES (p_metric_name, p_value, p_labels);

  -- Check each guardrail for this metric
  FOR v_guardrail IN
    SELECT *
    FROM guardrails_config
    WHERE metric_name = p_metric_name
      AND enabled = true
    ORDER BY severity ASC -- P0 first
  LOOP
    -- Calculate avg value in window
    SELECT COALESCE(AVG(value), 0) INTO v_avg_value
    FROM metrics_samples
    WHERE metric_name = p_metric_name
      AND ts > now() - (v_guardrail.window_minutes || ' minutes')::INTERVAL;

    -- Evaluate condition
    v_breach := CASE v_guardrail.condition
      WHEN 'gt' THEN v_avg_value > v_guardrail.threshold_value
      WHEN 'lt' THEN v_avg_value < v_guardrail.threshold_value
      WHEN 'gte' THEN v_avg_value >= v_guardrail.threshold_value
      WHEN 'lte' THEN v_avg_value <= v_guardrail.threshold_value
      WHEN 'eq' THEN v_avg_value = v_guardrail.threshold_value
      ELSE false
    END;

    -- If breached, add to triggered list
    IF v_breach THEN
      v_triggered := v_triggered || jsonb_build_object(
        'guardrail_name', v_guardrail.guardrail_name,
        'metric_name', v_guardrail.metric_name,
        'severity', v_guardrail.severity,
        'action', v_guardrail.action,
        'kill_switch_flag', v_guardrail.kill_switch_flag,
        'avg_value', v_avg_value,
        'threshold', v_guardrail.threshold_value,
        'window_minutes', v_guardrail.window_minutes,
        'breach_pct', ROUND((v_avg_value - v_guardrail.threshold_value) / NULLIF(v_guardrail.threshold_value, 0) * 100, 2)
      );

      -- Auto-rollback: disable feature flag if action = 'rollback' or 'kill_switch'
      IF v_guardrail.action IN ('rollback', 'kill_switch') AND v_guardrail.kill_switch_flag IS NOT NULL THEN
        UPDATE feature_flags
        SET enabled = false,
            rollout_percentage = 0,
            updated_at = now()
        WHERE flag_name = v_guardrail.kill_switch_flag
          AND enabled = true; -- Only rollback if currently enabled

        -- Check if rollback actually happened
        IF FOUND THEN
          v_rollback_count := v_rollback_count + 1;

          -- Log rollback event
          INSERT INTO metrics_samples (metric_name, value, labels)
          VALUES ('guardrail_auto_rollback', 1, jsonb_build_object(
            'guardrail', v_guardrail.guardrail_name,
            'flag', v_guardrail.kill_switch_flag,
            'metric', p_metric_name,
            'avg_value', v_avg_value,
            'threshold', v_guardrail.threshold_value,
            'severity', v_guardrail.severity,
            'reason', 'breach'
          ));

          RAISE NOTICE 'Auto-rollback triggered: % (flag: %, metric: %, avg: %, threshold: %)',
            v_guardrail.guardrail_name,
            v_guardrail.kill_switch_flag,
            p_metric_name,
            v_avg_value,
            v_guardrail.threshold_value;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- Log SLO breach if any guardrail triggered
  IF jsonb_array_length(v_triggered) > 0 THEN
    INSERT INTO metrics_samples (metric_name, value, labels)
    VALUES ('slo_breach_count', 1, jsonb_build_object(
      'metric', p_metric_name,
      'breaches', jsonb_array_length(v_triggered)
    ));
  END IF;

  RETURN jsonb_build_object(
    'metric_name', p_metric_name,
    'value', p_value,
    'avg_value', v_avg_value,
    'triggered', v_triggered,
    'rollback_count', v_rollback_count,
    'checked_at', now()
  );
END;
$$;

COMMENT ON FUNCTION evaluate_guardrails_v1 IS 'Phase 1 EPIC M: Record metric sample + evaluate guardrails + auto-rollback on breach';

-- ============================================================================
-- 2) Get SLO Status (aggregate metrics vs targets)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_slo_status_v1(
  p_domain TEXT DEFAULT NULL,
  p_lookback_minutes INT DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_metrics JSONB := '[]'::JSONB;
  v_metric RECORD;
  v_avg_value NUMERIC;
  v_p50_value NUMERIC;
  v_p95_value NUMERIC;
  v_p99_value NUMERIC;
  v_slo_met BOOLEAN;
  v_sample_count INT;
BEGIN
  FOR v_metric IN
    SELECT *
    FROM metrics_registry
    WHERE (p_domain IS NULL OR domain = p_domain)
      AND enabled = true
      AND slo_target IS NOT NULL
    ORDER BY domain, metric_name
  LOOP
    -- Get sample count in window
    SELECT COUNT(*) INTO v_sample_count
    FROM metrics_samples
    WHERE metric_name = v_metric.metric_name
      AND ts > now() - (p_lookback_minutes || ' minutes')::INTERVAL;

    -- Skip if no samples
    IF v_sample_count = 0 THEN
      CONTINUE;
    END IF;

    -- Calculate aggregate based on metric_type
    IF v_metric.metric_type = 'histogram' THEN
      -- Calculate percentiles for histogram metrics
      SELECT
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY value),
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value),
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY value)
      INTO v_p50_value, v_p95_value, v_p99_value
      FROM metrics_samples
      WHERE metric_name = v_metric.metric_name
        AND ts > now() - (p_lookback_minutes || ' minutes')::INTERVAL;

      -- Check SLO
      v_slo_met := true;
      IF v_metric.slo_target ? 'p50' AND v_p50_value > (v_metric.slo_target->>'p50')::NUMERIC THEN
        v_slo_met := false;
      END IF;
      IF v_metric.slo_target ? 'p95' AND v_p95_value > (v_metric.slo_target->>'p95')::NUMERIC THEN
        v_slo_met := false;
      END IF;
      IF v_metric.slo_target ? 'p99' AND v_p99_value > (v_metric.slo_target->>'p99')::NUMERIC THEN
        v_slo_met := false;
      END IF;

      v_metrics := v_metrics || jsonb_build_object(
        'metric', v_metric.metric_name,
        'type', v_metric.metric_type,
        'domain', v_metric.domain,
        'p50', ROUND(v_p50_value, 2),
        'p95', ROUND(v_p95_value, 2),
        'p99', ROUND(v_p99_value, 2),
        'slo_target', v_metric.slo_target,
        'met', v_slo_met,
        'sample_count', v_sample_count
      );
    ELSE
      -- Calculate AVG for gauge/counter metrics
      SELECT AVG(value) INTO v_avg_value
      FROM metrics_samples
      WHERE metric_name = v_metric.metric_name
        AND ts > now() - (p_lookback_minutes || ' minutes')::INTERVAL;

      -- Check SLO
      v_slo_met := true;
      IF v_metric.slo_target ? 'threshold' THEN
        v_slo_met := v_avg_value <= (v_metric.slo_target->>'threshold')::NUMERIC;
      ELSIF v_metric.slo_target ? 'max' THEN
        v_slo_met := v_avg_value <= (v_metric.slo_target->>'max')::NUMERIC;
      ELSIF v_metric.slo_target ? 'min' THEN
        v_slo_met := v_avg_value >= (v_metric.slo_target->>'min')::NUMERIC;
      END IF;

      v_metrics := v_metrics || jsonb_build_object(
        'metric', v_metric.metric_name,
        'type', v_metric.metric_type,
        'domain', v_metric.domain,
        'avg', ROUND(v_avg_value, 4),
        'slo_target', v_metric.slo_target,
        'met', v_slo_met,
        'sample_count', v_sample_count
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'domain', p_domain,
    'lookback_minutes', p_lookback_minutes,
    'metrics', v_metrics,
    'checked_at', now()
  );
END;
$$;

COMMENT ON FUNCTION get_slo_status_v1 IS 'Phase 1 EPIC M: Get current SLO status for a domain (or all domains)';

-- ============================================================================
-- 3) Get Active Guardrail Breaches (real-time monitoring)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_active_guardrail_breaches_v1(
  p_lookback_minutes INT DEFAULT 15
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_breaches JSONB := '[]'::JSONB;
  v_guardrail RECORD;
  v_avg_value NUMERIC;
  v_breach BOOLEAN;
  v_sample_count INT;
BEGIN
  FOR v_guardrail IN
    SELECT *
    FROM guardrails_config
    WHERE enabled = true
    ORDER BY severity ASC, guardrail_name
  LOOP
    -- Get sample count in window
    SELECT COUNT(*), COALESCE(AVG(value), 0)
    INTO v_sample_count, v_avg_value
    FROM metrics_samples
    WHERE metric_name = v_guardrail.metric_name
      AND ts > now() - (v_guardrail.window_minutes || ' minutes')::INTERVAL;

    -- Skip if no samples (metric not being reported)
    IF v_sample_count = 0 THEN
      CONTINUE;
    END IF;

    -- Evaluate condition
    v_breach := CASE v_guardrail.condition
      WHEN 'gt' THEN v_avg_value > v_guardrail.threshold_value
      WHEN 'lt' THEN v_avg_value < v_guardrail.threshold_value
      WHEN 'gte' THEN v_avg_value >= v_guardrail.threshold_value
      WHEN 'lte' THEN v_avg_value <= v_guardrail.threshold_value
      WHEN 'eq' THEN v_avg_value = v_guardrail.threshold_value
      ELSE false
    END;

    -- Add to breaches if active
    IF v_breach THEN
      v_breaches := v_breaches || jsonb_build_object(
        'guardrail', v_guardrail.guardrail_name,
        'metric', v_guardrail.metric_name,
        'severity', v_guardrail.severity,
        'action', v_guardrail.action,
        'kill_switch_flag', v_guardrail.kill_switch_flag,
        'avg_value', ROUND(v_avg_value, 4),
        'threshold', v_guardrail.threshold_value,
        'condition', v_guardrail.condition,
        'window_minutes', v_guardrail.window_minutes,
        'breach_pct', ROUND((v_avg_value - v_guardrail.threshold_value) / NULLIF(v_guardrail.threshold_value, 0) * 100, 2),
        'sample_count', v_sample_count
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'lookback_minutes', p_lookback_minutes,
    'breaches', v_breaches,
    'breach_count', jsonb_array_length(v_breaches),
    'checked_at', now()
  );
END;
$$;

COMMENT ON FUNCTION get_active_guardrail_breaches_v1 IS 'Phase 1 EPIC M: Get currently active guardrail breaches for monitoring';

-- ============================================================================
-- 4) Get Metric Samples (query helper for debugging)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_metric_samples_v1(
  p_metric_name TEXT,
  p_lookback_minutes INT DEFAULT 60,
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  ts TIMESTAMPTZ,
  value NUMERIC,
  labels JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT ms.ts, ms.value, ms.labels
  FROM metrics_samples ms
  WHERE ms.metric_name = p_metric_name
    AND ms.ts > now() - (p_lookback_minutes || ' minutes')::INTERVAL
  ORDER BY ms.ts DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION get_metric_samples_v1 IS 'Phase 1 EPIC M: Query metric samples for debugging (limited to 100 rows)';

-- ============================================================================
-- 5) Cleanup Old Samples (retention policy)
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_metric_samples_v1(
  p_retention_days INT DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count BIGINT;
BEGIN
  -- Delete samples older than retention period
  DELETE FROM metrics_samples
  WHERE ts < now() - (p_retention_days || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_count', v_deleted_count,
    'retention_days', p_retention_days,
    'cleaned_at', now()
  );
END;
$$;

COMMENT ON FUNCTION cleanup_old_metric_samples_v1 IS 'Phase 1 EPIC M: Cleanup metric samples older than retention period (default 7 days)';

-- ============================================================================
-- 6) Grants
-- ============================================================================

GRANT EXECUTE ON FUNCTION evaluate_guardrails_v1(TEXT, NUMERIC, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION get_slo_status_v1(TEXT, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_active_guardrail_breaches_v1(INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_metric_samples_v1(TEXT, INT, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_metric_samples_v1(INT) TO service_role;
