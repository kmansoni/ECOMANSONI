-- Migration: Add atomic session variable update RPC and orphaned session cleanup

-- 1. Atomic session variable merge — prevents race conditions on concurrent requests
CREATE OR REPLACE FUNCTION atomic_update_session_vars(
  p_session_id text,
  p_vars jsonb
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current jsonb;
  v_next jsonb;
BEGIN
  -- Atomically read current variables and merge with updates
  UPDATE INTO bot_sessions
    SET variables = COALESCE(variables, '{}'::jsonb) || p_vars || jsonb_build_object('updated_at', now()::text)
  WHERE id = p_session_id
  RETURNING variables INTO v_next;

  IF v_next IS NULL THEN
    RAISE EXCEPTION 'Session % not found', p_session_id;
  END IF;

  RETURN v_next;
END;
$$ LANGUAGE plpgsql;

-- 2. Cleanup orphaned sessions — sessions that expired but were never cleaned up
CREATE OR REPLACE FUNCTION cleanup_orphaned_sessions()
RETURNS bigint
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted bigint;
BEGIN
  -- Delete sessions where expires_at has passed AND no messages from this session exist in the last 24h
  DELETE FROM bot_sessions
  WHERE (expires_at IS NOT NULL AND expires_at < now())
    AND id NOT IN (
      SELECT DISTINCT session_id
      FROM bot_runs
      WHERE created_at > now() - interval '24 hours'
        AND session_id IS NOT NULL
    )
    AND id NOT IN (
      SELECT DISTINCT session_id
      FROM bot_conversation_states
      WHERE updated_at > now() - interval '1 hour'
    );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- 3. Also add a simpler atomic getter for session variables used by the engine
CREATE OR REPLACE FUNCTION get_session_vars(p_session_id text)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vars jsonb;
BEGIN
  SELECT COALESCE(variables, '{}'::jsonb)
  INTO v_vars
  FROM bot_sessions
  WHERE id = p_session_id
  FOR UPDATE; -- Row-level lock to prevent concurrent reads

  RETURN v_vars;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION atomic_update_session_vars IS 'Atomically merge session variables to prevent race conditions in concurrent bot event processing';
COMMENT ON FUNCTION cleanup_orphaned_sessions IS 'Remove expired bot sessions that have no recent activity';
COMMENT ON FUNCTION get_session_vars IS 'Get session variables with row-level lock for safe concurrent access';