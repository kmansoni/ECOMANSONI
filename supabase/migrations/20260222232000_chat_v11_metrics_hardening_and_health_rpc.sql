-- =====================================================
-- Chat protocol v1.1: metrics hardening + health RPC
-- =====================================================

-- 1) Harden ingestion: whitelist metric names and label size caps
CREATE OR REPLACE FUNCTION public.chat_ingest_client_metric_v11(
  p_name TEXT,
  p_value DOUBLE PRECISION,
  p_labels JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE(ok BOOLEAN, server_ts TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_name TEXT := trim(coalesce(p_name, ''));
  v_labels JSONB := CASE
    WHEN p_labels IS NULL THEN '{}'::jsonb
    WHEN jsonb_typeof(p_labels) <> 'object' THEN jsonb_build_object('raw', p_labels)
    ELSE p_labels
  END;
  v_allowed BOOLEAN := false;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'ERR_INVALID_ARGUMENT';
  END IF;

  v_allowed := v_name = ANY (ARRAY[
    'inbox_fetch_count_per_open',
    'ack_without_receipt_path',
    'ack_without_receipt_10s_rate',
    'forced_resync_count',
    'write_receipt_latency_ms'
  ]);

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'ERR_INVALID_ARGUMENT';
  END IF;

  IF abs(coalesce(p_value, 0)) > 1e9 THEN
    RAISE EXCEPTION 'ERR_INVALID_ARGUMENT';
  END IF;

  IF length(v_labels::text) > 2048 THEN
    v_labels := jsonb_build_object('trimmed', true, 'reason', 'labels_too_large');
  END IF;

  INSERT INTO public.chat_client_metrics(actor_id, metric_name, metric_value, labels)
  VALUES (
    v_user,
    left(v_name, 120),
    coalesce(p_value, 0),
    v_labels
  );

  RETURN QUERY SELECT true, now();
END;
$$;

-- 2) Health RPC for operational dashboards
CREATE OR REPLACE FUNCTION public.chat_get_v11_health()
RETURNS TABLE(
  server_ts TIMESTAMPTZ,
  ack_without_receipt_10s_count DOUBLE PRECISION,
  forced_resync_count DOUBLE PRECISION,
  write_receipt_latency_p95_ms DOUBLE PRECISION,
  write_receipt_samples BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    h.server_ts,
    COALESCE(h.ack_without_receipt_10s_count, 0)::DOUBLE PRECISION,
    COALESCE(h.forced_resync_count, 0)::DOUBLE PRECISION,
    COALESCE(h.write_receipt_latency_p95_ms, 0)::DOUBLE PRECISION,
    COALESCE(h.write_receipt_samples, 0)::BIGINT
  FROM public.chat_v11_health_last_15m h;
$$;

GRANT EXECUTE ON FUNCTION public.chat_ingest_client_metric_v11(TEXT, DOUBLE PRECISION, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_get_v11_health() TO authenticated;

