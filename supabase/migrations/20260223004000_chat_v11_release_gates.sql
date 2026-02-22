-- =====================================================
-- Chat protocol v1.1: release gates RPC for canary decisions
-- =====================================================

CREATE OR REPLACE FUNCTION public.chat_get_v11_release_gates(
  p_max_ack_without_receipt_10s_count DOUBLE PRECISION DEFAULT 0,
  p_max_forced_resync_count DOUBLE PRECISION DEFAULT 50,
  p_max_write_receipt_latency_p95_ms DOUBLE PRECISION DEFAULT 5000,
  p_min_recovery_policy_samples_15m BIGINT DEFAULT 1
)
RETURNS TABLE(
  server_ts TIMESTAMPTZ,
  ack_without_receipt_10s_count DOUBLE PRECISION,
  forced_resync_count DOUBLE PRECISION,
  write_receipt_latency_p95_ms DOUBLE PRECISION,
  recovery_policy_samples_15m BIGINT,
  gate_p0_ok BOOLEAN,
  gate_p1_ok BOOLEAN,
  gate_rollout_ok BOOLEAN,
  rollout_decision TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH h AS (
    SELECT * FROM public.chat_get_v11_health_extended()
  ),
  eval AS (
    SELECT
      h.server_ts,
      h.ack_without_receipt_10s_count,
      h.forced_resync_count,
      h.write_receipt_latency_p95_ms,
      h.recovery_policy_samples_15m,
      (h.ack_without_receipt_10s_count <= COALESCE(p_max_ack_without_receipt_10s_count, 0)) AS gate_p0_ok,
      (
        h.forced_resync_count <= COALESCE(p_max_forced_resync_count, 50)
        AND h.write_receipt_latency_p95_ms <= COALESCE(p_max_write_receipt_latency_p95_ms, 5000)
        AND h.recovery_policy_samples_15m >= COALESCE(p_min_recovery_policy_samples_15m, 1)
      ) AS gate_p1_ok
    FROM h
  )
  SELECT
    e.server_ts,
    e.ack_without_receipt_10s_count,
    e.forced_resync_count,
    e.write_receipt_latency_p95_ms,
    e.recovery_policy_samples_15m,
    e.gate_p0_ok,
    e.gate_p1_ok,
    (e.gate_p0_ok AND e.gate_p1_ok) AS gate_rollout_ok,
    CASE
      WHEN NOT e.gate_p0_ok THEN 'ROLLBACK_P0'
      WHEN NOT e.gate_p1_ok THEN 'HOLD_P1'
      ELSE 'PROCEED'
    END AS rollout_decision
  FROM eval e;
$$;

GRANT EXECUTE ON FUNCTION public.chat_get_v11_release_gates(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BIGINT) TO authenticated;

