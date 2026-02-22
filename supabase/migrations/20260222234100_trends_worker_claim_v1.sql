-- Trends worker: claim/lease contract (v1)
-- Adds a safe claim mechanism so an Edge Function can process runs without double-execution.

ALTER TABLE public.trend_runs
  ADD COLUMN IF NOT EXISTS claimed_by TEXT,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_trend_runs_claim_expiry
  ON public.trend_runs(status, claim_expires_at, started_at);

CREATE OR REPLACE FUNCTION public.claim_trend_runs_v1(
  p_limit INT DEFAULT 5,
  p_worker_id TEXT DEFAULT 'trends-worker',
  p_lease_seconds INT DEFAULT 90
)
RETURNS TABLE (
  run_id UUID,
  segment_id TEXT,
  "window" TEXT,
  started_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT := GREATEST(1, LEAST(p_limit, 50));
  v_lease INT := GREATEST(10, LEAST(p_lease_seconds, 600));
  v_worker TEXT := left(COALESCE(NULLIF(trim(p_worker_id), ''), 'trends-worker'), 120);
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT tr.run_id
    FROM public.trend_runs tr
    WHERE tr.status = 'running'
      AND (tr.claim_expires_at IS NULL OR tr.claim_expires_at < now())
    ORDER BY tr.started_at ASC
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.trend_runs tr
       SET claimed_by = v_worker,
           claimed_at = now(),
           claim_expires_at = now() + (v_lease || ' seconds')::interval,
           updated_at = now()
      FROM candidates c
     WHERE tr.run_id = c.run_id
     RETURNING tr.run_id, tr.segment_id, tr.window_key, tr.started_at
  )
  SELECT claimed.run_id, claimed.segment_id, claimed.window_key AS "window", claimed.started_at
  FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_trend_runs_v1(INT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_trend_runs_v1(INT, TEXT, INT) TO service_role;
