-- Migration: Distributed rate limiting for Edge Functions
--
-- Provides an atomic sliding-window counter per (key, window) that works
-- across all serverless instances. Used by email-smtp-settings and other
-- Edge Functions that previously relied on broken in-memory Maps.
--
-- Table: edge_rate_limits
--   key          — composite identifier, e.g. "smtp-settings:<user_id>"
--   count        — requests in current window
--   window_start — start of current sliding window
--
-- Function: edge_rate_limit_check(p_key, p_window_seconds, p_max)
--   Atomically: if window expired, reset; else increment.
--   Returns { allowed: bool, remaining: int }.

-- ─── Table ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.edge_rate_limits (
    key          TEXT        PRIMARY KEY,
    count        INT         NOT NULL DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by key (primary key covers it) + periodic cleanup index
CREATE INDEX IF NOT EXISTS edge_rate_limits_window_start_idx
    ON public.edge_rate_limits (window_start);

-- RLS: only service_role can read/write (Edge Functions use service_role client)
ALTER TABLE public.edge_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "edge_rate_limits: service_role only"
    ON public.edge_rate_limits
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ─── Periodic cleanup ────────────────────────────────────────────────────────
-- Prevents unbounded table growth. Runs automatically via pg_cron if available;
-- otherwise a daily job can call: DELETE FROM edge_rate_limits WHERE window_start < NOW() - INTERVAL '1 day'.
-- The migration itself doesn't schedule pg_cron since it may not be enabled.

-- ─── Core function ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.edge_rate_limit_check(
    p_key            TEXT,
    p_window_seconds INT,
    p_max            INT
)
RETURNS JSON
LANGUAGE plpgsql
VOLATILE           -- writes to table, cannot be STABLE/IMMUTABLE
SECURITY DEFINER   -- runs as owner (postgres), bypasses RLS so service_role client works
SET search_path = public
AS $$
DECLARE
    v_count        INT;
    v_window_start TIMESTAMPTZ;
    v_now          TIMESTAMPTZ := NOW();
    v_window_age   INTERVAL;
    v_allowed      BOOLEAN;
    v_remaining    INT;
BEGIN
    -- Atomic UPSERT + conditional reset:
    --   1. Try to insert a fresh row (count=1).
    --   2. On conflict: check if current window has expired.
    --      - Expired  → reset count=1, window_start=NOW().
    --      - Valid    → increment count.
    -- The entire operation runs in a single statement — atomic under READ COMMITTED.
    INSERT INTO public.edge_rate_limits (key, count, window_start)
    VALUES (p_key, 1, v_now)
    ON CONFLICT (key) DO UPDATE
        SET count        = CASE
                               WHEN public.edge_rate_limits.window_start
                                    < v_now - (p_window_seconds || ' seconds')::INTERVAL
                               THEN 1                                          -- window expired: reset
                               ELSE public.edge_rate_limits.count + 1         -- still in window: increment
                           END,
            window_start = CASE
                               WHEN public.edge_rate_limits.window_start
                                    < v_now - (p_window_seconds || ' seconds')::INTERVAL
                               THEN v_now                                      -- reset window start
                               ELSE public.edge_rate_limits.window_start       -- keep existing
                           END
    RETURNING count, window_start INTO v_count, v_window_start;

    v_allowed   := v_count <= p_max;
    v_remaining := GREATEST(0, p_max - v_count);

    RETURN json_build_object(
        'allowed',   v_allowed,
        'remaining', v_remaining,
        'count',     v_count,
        'resetAt',   EXTRACT(EPOCH FROM (v_window_start + (p_window_seconds || ' seconds')::INTERVAL))::BIGINT * 1000
    );
END;
$$;

COMMENT ON FUNCTION public.edge_rate_limit_check(TEXT, INT, INT) IS
    'Atomic sliding-window rate limiter for Edge Functions. '
    'Returns JSON: { allowed, remaining, count, resetAt }. '
    'Replaces broken in-memory Maps that do not persist across serverless cold starts.';
