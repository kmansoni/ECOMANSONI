-- =====================================================
-- Chat protocol v1.1: extended health RPC with policy snapshot
-- =====================================================

CREATE OR REPLACE FUNCTION public.chat_get_v11_health_extended()
RETURNS TABLE(
  server_ts TIMESTAMPTZ,
  ack_without_receipt_10s_count DOUBLE PRECISION,
  forced_resync_count DOUBLE PRECISION,
  write_receipt_latency_p95_ms DOUBLE PRECISION,
  write_receipt_samples BIGINT,
  recovery_policy_samples_15m BIGINT,
  recovery_policy_last_labels JSONB,
  recovery_policy_last_seen_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH health AS (
    SELECT
      h.server_ts,
      COALESCE(h.ack_without_receipt_10s_count, 0)::DOUBLE PRECISION AS ack_without_receipt_10s_count,
      COALESCE(h.forced_resync_count, 0)::DOUBLE PRECISION AS forced_resync_count,
      COALESCE(h.write_receipt_latency_p95_ms, 0)::DOUBLE PRECISION AS write_receipt_latency_p95_ms,
      COALESCE(h.write_receipt_samples, 0)::BIGINT AS write_receipt_samples
    FROM public.chat_v11_health_last_15m h
  ),
  policy_15m AS (
    SELECT
      COALESCE(COUNT(*), 0)::BIGINT AS samples_15m
    FROM public.chat_client_metrics m
    WHERE m.metric_name = 'recovery_policy_snapshot'
      AND m.created_at >= now() - interval '15 minutes'
  ),
  policy_latest AS (
    SELECT
      COALESCE(m.labels, '{}'::jsonb) AS labels,
      m.created_at AS seen_at
    FROM public.chat_client_metrics m
    WHERE m.metric_name = 'recovery_policy_snapshot'
    ORDER BY m.created_at DESC
    LIMIT 1
  )
  SELECT
    health.server_ts,
    health.ack_without_receipt_10s_count,
    health.forced_resync_count,
    health.write_receipt_latency_p95_ms,
    health.write_receipt_samples,
    policy_15m.samples_15m,
    COALESCE(policy_latest.labels, '{}'::jsonb),
    policy_latest.seen_at
  FROM health
  CROSS JOIN policy_15m
  LEFT JOIN policy_latest ON true;
$$;

GRANT EXECUTE ON FUNCTION public.chat_get_v11_health_extended() TO authenticated;

