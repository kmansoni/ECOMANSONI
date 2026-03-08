-- ─── TOTP Replay Protection ──────────────────────────────────────────────────
-- Adds last_used_counter to track the last consumed TOTP time-step.
-- RFC 6238 §5.2: implementations SHOULD disallow previously-used steps.
--
-- The totp_consume_step() function performs an atomic CAS (compare-and-swap):
--   UPDATE ... WHERE last_used_counter IS NULL OR last_used_counter < p_step
-- If the step was already used (or a later one was already recorded) the
-- function returns false, causing the Edge Function to reject the attempt.
--
-- Isolation: runs at default READ COMMITTED; the UPDATE is atomic because
-- PostgreSQL row-level locks prevent concurrent updates to the same row.
-- In the unlikely event of two simultaneous logins with the same code, only
-- one UPDATE will match the WHERE clause — the second gets 0 rows and loses.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Column
ALTER TABLE public.user_totp_secrets
  ADD COLUMN IF NOT EXISTS last_used_counter bigint;

-- 2. Atomic consume function (SECURITY DEFINER — called by service_role only)
CREATE OR REPLACE FUNCTION public.totp_consume_step(
  p_user_id uuid,
  p_step    bigint
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE user_totp_secrets
  SET    last_used_counter = p_step
  WHERE  user_id = p_user_id
    AND  is_enabled = true
    AND  (last_used_counter IS NULL OR last_used_counter < p_step);

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

COMMENT ON FUNCTION public.totp_consume_step(uuid, bigint) IS
  'Atomically records the last consumed TOTP time-step for replay protection. '
  'Returns true if the step was freshly consumed, false if already used or a '
  'later step was already recorded.';

-- Grant to service_role only; the Edge Function always uses service_role key.
REVOKE ALL ON FUNCTION public.totp_consume_step(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.totp_consume_step(uuid, bigint) TO service_role;
