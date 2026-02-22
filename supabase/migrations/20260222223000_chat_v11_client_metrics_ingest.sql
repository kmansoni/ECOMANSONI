-- =====================================================
-- Chat protocol v1.1: client metrics ingestion (MVP canary observability)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.chat_client_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  metric_name TEXT NOT NULL,
  metric_value DOUBLE PRECISION NOT NULL,
  labels JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_client_metrics_name_time
  ON public.chat_client_metrics (metric_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_client_metrics_actor_time
  ON public.chat_client_metrics (actor_id, created_at DESC);

ALTER TABLE public.chat_client_metrics ENABLE ROW LEVEL SECURITY;

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
BEGIN
  IF v_name = '' THEN
    RAISE EXCEPTION 'ERR_INVALID_ARGUMENT';
  END IF;

  INSERT INTO public.chat_client_metrics(actor_id, metric_name, metric_value, labels)
  VALUES (
    v_user,
    left(v_name, 120),
    coalesce(p_value, 0),
    CASE
      WHEN p_labels IS NULL THEN '{}'::jsonb
      WHEN jsonb_typeof(p_labels) <> 'object' THEN jsonb_build_object('raw', p_labels)
      ELSE p_labels
    END
  );

  RETURN QUERY SELECT true, now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.chat_ingest_client_metric_v11(TEXT, DOUBLE PRECISION, JSONB) TO authenticated;

