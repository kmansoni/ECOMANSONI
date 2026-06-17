-- Content Core — SQL Migration 005
-- Outbox event handling functions
-- Created: 2024-01-01

-- ============================================================================
-- FUNCTION: claim_next_outbox_event
-- ============================================================================
-- FOR UPDATE SKIP LOCKED → status=IN_FLIGHT, lease_expires_at=NOW+seconds
-- Only status IN ('PENDING') AND next_attempt_at <= NOW
-- ============================================================================

CREATE OR REPLACE FUNCTION claim_next_outbox_event(
  p_worker_id TEXT,
  p_lease_seconds INT DEFAULT 30
)
RETURNS TABLE (
  event_id UUID,
  aggregate_type TEXT,
  aggregate_id UUID,
  aggregate_version BIGINT,
  event_type TEXT,
  payload JSONB,
  attempt_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id UUID;
  v_aggregate_type TEXT;
  v_aggregate_id UUID;
  v_aggregate_version BIGINT;
  v_event_type TEXT;
  v_payload JSONB;
  v_attempt_count INT;
BEGIN
  -- Find and claim the next available event
  SELECT
    e.id,
    e.aggregate_type,
    e.aggregate_id,
    e.aggregate_version,
    e.event_type,
    e.payload,
    e.attempt_count
  INTO
    v_event_id,
    v_aggregate_type,
    v_aggregate_id,
    v_aggregate_version,
    v_event_type,
    v_payload,
    v_attempt_count
  FROM outbox_events e
  WHERE e.status = 'PENDING'
  AND e.next_attempt_at <= NOW()
  AND (e.lease_expires_at IS NULL OR e.lease_expires_at < NOW())
  ORDER BY e.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- If no event found, return empty
  IF v_event_id IS NULL THEN
    RETURN;
  END IF;

  -- Claim the event
  UPDATE outbox_events
  SET
    status = 'IN_FLIGHT',
    worker_id = p_worker_id,
    lease_expires_at = NOW() + (p_lease_seconds || ' seconds')::INTERVAL,
    attempt_count = attempt_count + 1,
    updated_at = NOW()
  WHERE id = v_event_id;

  RETURN QUERY
  SELECT
    v_event_id,
    v_aggregate_type,
    v_aggregate_id,
    v_aggregate_version,
    v_event_type,
    v_payload,
    v_attempt_count + 1;
END;
$$;

-- ============================================================================
-- FUNCTION: renew_outbox_lease
-- ============================================================================
-- Extends lease only if worker_id matches AND lease not expired
-- ============================================================================

CREATE OR REPLACE FUNCTION renew_outbox_lease(
  p_event_id UUID,
  p_worker_id TEXT,
  p_lease_seconds INT DEFAULT 30
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only lock owner can renew
  UPDATE outbox_events
  SET
    lease_expires_at = NOW() + (p_lease_seconds || ' seconds')::INTERVAL,
    updated_at = NOW()
  WHERE id = p_event_id
  AND worker_id = p_worker_id
  AND status = 'IN_FLIGHT'
  AND lease_expires_at > NOW();

  RETURN FOUND;
END;
$$;

-- ============================================================================
-- FUNCTION: mark_outbox_delivered
-- ============================================================================
-- status=DELIVERED, delivered_at=NOW. Only lock owner can call.
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_outbox_delivered(
  p_event_id UUID,
  p_worker_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only lock owner can mark delivered
  UPDATE outbox_events
  SET
    status = 'DELIVERED',
    delivered_at = NOW(),
    worker_id = NULL,
    lease_expires_at = NULL,
    updated_at = NOW()
  WHERE id = p_event_id
  AND worker_id = p_worker_id
  AND status = 'IN_FLIGHT';

  RETURN FOUND;
END;
$$;

-- ============================================================================
-- FUNCTION: mark_outbox_failed
-- ============================================================================
-- Retry with exponential backoff or dead letter after max attempts
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_outbox_failed(
  p_event_id UUID,
  p_worker_id TEXT,
  p_error_message TEXT,
  p_retry_delay_seconds INT DEFAULT 1,
  p_max_attempts INT DEFAULT 5
)
RETURNS TABLE (
  success BOOLEAN,
  should_dead_letter BOOLEAN,
  new_status TEXT,
  next_attempt_at TIMESTAMPTZ,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_attempt INT;
  v_new_status TEXT;
  v_should_dead_letter BOOLEAN;
  v_next_attempt_at TIMESTAMPTZ;
BEGIN
  -- Get current attempt count
  SELECT attempt_count INTO v_current_attempt
  FROM outbox_events
  WHERE id = p_event_id AND worker_id = p_worker_id AND status = 'IN_FLIGHT';

  IF v_current_attempt IS NULL THEN
    RETURN QUERY SELECT FALSE, FALSE, NULL::TEXT, NULL::TIMESTAMPTZ, 'Event not found or not owned by worker'::TEXT;
    RETURN;
  END IF;

  -- Check if should dead letter
  IF v_current_attempt >= p_max_attempts THEN
    v_should_dead_letter := TRUE;
    v_new_status := 'DEAD_LETTER';
    v_next_attempt_at := NULL;
  ELSE
    v_should_dead_letter := FALSE;
    v_new_status := 'PENDING';
    -- Exponential backoff: delay * 2^(attempt-1), max 60 seconds
    v_next_attempt_at := NOW() + (LEAST(p_retry_delay_seconds * POWER(2, v_current_attempt - 1), 60) || ' seconds')::INTERVAL;
  END IF;

  -- Update event
  UPDATE outbox_events
  SET
    status = v_new_status,
    last_error = p_error_message,
    next_attempt_at = v_next_attempt_at,
    worker_id = NULL,
    lease_expires_at = NULL,
    updated_at = NOW()
  WHERE id = p_event_id;

  RETURN QUERY SELECT TRUE, v_should_dead_letter, v_new_status, v_next_attempt_at, NULL::TEXT;
END;
$$;

-- ============================================================================
-- FUNCTION: move_outbox_to_dead_letter
-- ============================================================================
-- Terminal state. Only lock owner can call.
-- ============================================================================

CREATE OR REPLACE FUNCTION move_outbox_to_dead_letter(
  p_event_id UUID,
  p_worker_id TEXT,
  p_error_message TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only lock owner can move to dead letter
  UPDATE outbox_events
  SET
    status = 'DEAD_LETTER',
    last_error = p_error_message,
    worker_id = NULL,
    lease_expires_at = NULL,
    updated_at = NOW()
  WHERE id = p_event_id
  AND worker_id = p_worker_id;

  RETURN FOUND;
END;
$$;

-- ============================================================================
-- FUNCTION: release_stale_outbox_locks
-- ============================================================================
-- Releases locks that have expired (for recovery after worker crash)
-- ============================================================================

CREATE OR REPLACE FUNCTION release_stale_outbox_locks()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE outbox_events
  SET
    status = 'PENDING',
    worker_id = NULL,
    lease_expires_at = NULL,
    updated_at = NOW()
  WHERE status = 'IN_FLIGHT'
  AND lease_expires_at < NOW();

  RETURN FOUND;
END;
$$;

-- ============================================================================
-- FUNCTION: get_outbox_metrics
-- ============================================================================
-- Returns current outbox statistics
-- ============================================================================

CREATE OR REPLACE FUNCTION get_outbox_metrics()
RETURNS TABLE (
  total_pending BIGINT,
  total_in_flight BIGINT,
  total_delivered BIGINT,
  total_dead_letter BIGINT,
  oldest_pending_age_seconds BIGINT,
  average_attempts NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE status = 'PENDING') AS total_pending,
    COUNT(*) FILTER (WHERE status = 'IN_FLIGHT') AS total_in_flight,
    COUNT(*) FILTER (WHERE status = 'DELIVERED') AS total_delivered,
    COUNT(*) FILTER (WHERE status = 'DEAD_LETTER') AS total_dead_letter,
    EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) FILTER (WHERE status = 'PENDING')::BIGINT AS oldest_pending_age_seconds,
    COALESCE(AVG(attempt_count), 0) AS average_attempts
  FROM outbox_events;
END;
$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION claim_next_outbox_event IS
'Claims next available outbox event with distributed locking.
Uses FOR UPDATE SKIP LOCKED to prevent duplicate claims by parallel workers.
Only claims events with status=PENDING and next_attempt_at <= NOW.';

COMMENT ON FUNCTION renew_outbox_lease IS
'Extends lease on owned event. Only lock owner can renew.
Returns TRUE if successful, FALSE if not owner or lease expired.';

COMMENT ON FUNCTION mark_outbox_delivered IS
'Marks event as delivered. Only lock owner can call.
Sets status=DELIVERED, delivered_at=NOW, clears lock ownership.';

COMMENT ON FUNCTION mark_outbox_failed IS
'Handles failed delivery with exponential backoff.
If attempt_count >= max_attempts → dead_letter.
Otherwise → status=PENDING with next_attempt_at = NOW + delay*2^(attempt-1).';

COMMENT ON FUNCTION move_outbox_to_dead_letter IS
'Terminal state for permanently failed events. Only lock owner can call.
Sets status=DEAD_LETTER, preserves error for debugging.';