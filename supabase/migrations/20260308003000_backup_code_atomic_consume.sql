-- ─── Atomic Backup Code Consumption ─────────────────────────────────────────
-- Fixes: race condition in TOTP backup code single-use enforcement.
--
-- Problem: the Edge Function previously did SELECT → JS verify → UPDATE
-- as three separate statements (via PostgREST REST API). Under READ COMMITTED
-- isolation, two concurrent requests could both SELECT before either UPDATE
-- committed, both verify the same code as unused, and both succeed — violating
-- the single-use guarantee.
--
-- Fix: A single PL/pgSQL function executes SELECT ... FOR UPDATE (exclusive
-- row-level lock) + UPDATE atomically inside one DB transaction. The lock
-- serialises concurrent callers: the second request blocks until the first
-- commits, then re-reads the now-consumed array element and returns false.
--
-- Isolation note: the function runs at READ COMMITTED (PostgreSQL default).
-- The FOR UPDATE clause is sufficient because it prevents any other transaction
-- from reading the row until the first transaction commits, eliminating the
-- lost-update anomaly.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.consume_backup_code(
  p_user_id   uuid,
  p_code_hash text       -- format: "sha256:<hex>" — caller must pre-hash
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codes  text[];
  v_idx    integer;
BEGIN
  -- Exclusive row lock → serialises concurrent calls for the same user
  SELECT backup_codes
  INTO   v_codes
  FROM   user_totp_secrets
  WHERE  user_id    = p_user_id
    AND  is_enabled = true
  FOR UPDATE;

  -- No row or 2FA not enabled
  IF v_codes IS NULL THEN
    RETURN false;
  END IF;

  -- Find the matching unused hash (array_position returns 1-based index)
  v_idx := array_position(v_codes, p_code_hash);
  IF v_idx IS NULL THEN
    RETURN false;   -- not found or already consumed ("used:...")
  END IF;

  -- Mark as consumed — replaces the hash, preserving array length
  v_codes[v_idx] := 'used:' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

  UPDATE user_totp_secrets
  SET    backup_codes = v_codes
  WHERE  user_id = p_user_id;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.consume_backup_code(uuid, text) IS
  'Atomically verifies and consumes a TOTP backup code. '
  'Uses SELECT FOR UPDATE to prevent concurrent double-use. '
  'Returns true if the code was valid and freshly consumed, false otherwise.';

-- Only the Edge Function (service_role) may call this.
REVOKE ALL ON FUNCTION public.consume_backup_code(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_backup_code(uuid, text) TO service_role;
