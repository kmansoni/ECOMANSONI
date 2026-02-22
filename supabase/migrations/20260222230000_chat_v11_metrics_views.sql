-- =====================================================
-- Chat protocol v1.1: metrics views for canary/P0-P1 observability
-- =====================================================

CREATE OR REPLACE VIEW public.chat_v11_metrics_last_15m AS
SELECT
  metric_name,
  COALESCE(labels->>'kind', 'unknown') AS metric_kind,
  COUNT(*)::BIGINT AS sample_count,
  SUM(metric_value)::DOUBLE PRECISION AS sum_value,
  AVG(metric_value)::DOUBLE PRECISION AS avg_value,
  PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY metric_value) AS p95_value,
  MAX(created_at) AS last_seen_at
FROM public.chat_client_metrics
WHERE created_at >= now() - interval '15 minutes'
GROUP BY metric_name, COALESCE(labels->>'kind', 'unknown');

CREATE OR REPLACE VIEW public.chat_v11_health_last_15m AS
WITH base AS (
  SELECT metric_name, metric_value
  FROM public.chat_client_metrics
  WHERE created_at >= now() - interval '15 minutes'
),
agg AS (
  SELECT
    COALESCE(SUM(CASE WHEN metric_name = 'ack_without_receipt_10s_rate' THEN metric_value ELSE 0 END), 0)::DOUBLE PRECISION AS ack_without_receipt_10s_count,
    COALESCE(SUM(CASE WHEN metric_name = 'forced_resync_count' THEN metric_value ELSE 0 END), 0)::DOUBLE PRECISION AS forced_resync_count,
    COALESCE(PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY CASE WHEN metric_name = 'write_receipt_latency_ms' THEN metric_value ELSE NULL END), 0)::DOUBLE PRECISION AS write_receipt_latency_p95_ms,
    COALESCE(COUNT(*) FILTER (WHERE metric_name = 'write_receipt_latency_ms'), 0)::BIGINT AS write_receipt_samples
  FROM base
)
SELECT
  now() AS server_ts,
  ack_without_receipt_10s_count,
  forced_resync_count,
  write_receipt_latency_p95_ms,
  write_receipt_samples
FROM agg;

GRANT SELECT ON public.chat_v11_metrics_last_15m TO authenticated;
GRANT SELECT ON public.chat_v11_health_last_15m TO authenticated;

