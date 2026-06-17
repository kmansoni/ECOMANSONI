-- Content Core — SQL Migration 003
-- atomic_publish function with optimistic locking and idempotency
-- Created: 2024-01-01

-- ============================================================================
-- FUNCTION: atomic_publish
-- ============================================================================
-- Owner check + optimistic lock + idempotency
-- Transaction: UPDATE asset → INSERT lifecycle_log → INSERT outbox_event
-- Returns: (success, new_version, idempotent, error_message)
-- ============================================================================

CREATE OR REPLACE FUNCTION atomic_publish(
  p_asset_id UUID,
  p_owner_id UUID,
  p_expected_version BIGINT,
  p_idempotency_key TEXT,
  p_target_status TEXT DEFAULT 'READY',
  p_visibility TEXT DEFAULT 'public'
)
RETURNS TABLE (
  success BOOLEAN,
  new_version BIGINT,
  idempotent BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_version BIGINT;
  v_new_version BIGINT;
  v_is_idempotent BOOLEAN := FALSE;
  v_error_message TEXT;
BEGIN
  -- Check idempotency key first
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM container_lifecycle_logs
      WHERE idempotency_key = p_idempotency_key
    ) THEN
      -- Idempotent no-op
      SELECT aggregate_version INTO v_current_version
      FROM assets WHERE id = p_asset_id;

      RETURN QUERY SELECT TRUE, v_current_version, TRUE, NULL::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Lock the asset row
  SELECT aggregate_version INTO v_current_version
  FROM assets
  WHERE id = p_asset_id
  FOR UPDATE;

  -- Check ownership
  IF NOT EXISTS (
    SELECT 1 FROM assets WHERE id = p_asset_id AND owner_id = p_owner_id
  ) THEN
    RETURN QUERY SELECT FALSE, 0::BIGINT, FALSE, 'Ownership check failed'::TEXT;
    RETURN;
  END IF;

  -- Check version (optimistic locking)
  IF v_current_version != p_expected_version THEN
    RETURN QUERY SELECT FALSE, v_current_version, FALSE,
      'Version mismatch: expected ' || p_expected_version || ', got ' || v_current_version;
    RETURN;
  END IF;

  -- Validate state transition
  IF NOT EXISTS (
    SELECT 1 FROM assets
    WHERE id = p_asset_id
    AND status IN ('PENDING', 'PROCESSING')
  ) THEN
    RETURN QUERY SELECT FALSE, v_current_version, FALSE,
      'Invalid state transition: asset not in PENDING or PROCESSING state';
    RETURN;
  END IF;

  -- Update asset
  v_new_version := v_current_version + 1;

  UPDATE assets
  SET
    status = p_target_status,
    aggregate_version = v_new_version,
    updated_at = NOW()
  WHERE id = p_asset_id;

  -- Insert lifecycle log
  INSERT INTO container_lifecycle_logs (
    entity_type,
    entity_id,
    from_status,
    to_status,
    actor_type,
    actor_id,
    reason,
    idempotency_key,
    metadata
  ) VALUES (
    'asset',
    p_asset_id,
    (SELECT status FROM assets WHERE id = p_asset_id),
    p_target_status,
    'user',
    p_owner_id,
    'Published via atomic_publish',
    p_idempotency_key,
    jsonb_build_object(
      'visibility', p_visibility,
      'previous_version', v_current_version,
      'new_version', v_new_version
    )
  );

  -- Insert outbox event
  INSERT INTO outbox_events (
    aggregate_type,
    aggregate_id,
    aggregate_version,
    event_type,
    payload,
    status,
    idempotency_key
  ) VALUES (
    'asset',
    p_asset_id,
    v_new_version,
    'AssetPublished',
    jsonb_build_object(
      'assetId', p_asset_id,
      'ownerId', p_owner_id,
      'status', p_target_status,
      'visibility', p_visibility
    ),
    'PENDING',
    p_idempotency_key
  );

  RETURN QUERY SELECT TRUE, v_new_version, FALSE, NULL::TEXT;
END;
$$;

-- ============================================================================
-- FUNCTION: get_asset_with_lock
-- ============================================================================
-- Get asset with FOR UPDATE lock
-- ============================================================================

CREATE OR REPLACE FUNCTION get_asset_with_lock(
  p_asset_id UUID,
  p_owner_id UUID
)
RETURNS TABLE (
  id UUID,
  owner_id UUID,
  status TEXT,
  aggregate_version BIGINT,
  storage_key TEXT,
  mime_type TEXT,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Check ownership first
  IF NOT EXISTS (
    SELECT 1 FROM assets WHERE id = p_asset_id AND owner_id = p_owner_id
  ) THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, NULL::TEXT, NULL::BIGINT, NULL::TEXT, NULL::TEXT,
      'Ownership check failed'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.owner_id,
    a.status,
    a.aggregate_version,
    a.storage_key,
    a.mime_type,
    NULL::TEXT as error_message
  FROM assets a
  WHERE a.id = p_asset_id
  FOR UPDATE;
END;
$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION atomic_publish IS
'Atomic publish with owner check, optimistic lock (aggregate_version), and idempotency.
Transaction boundary: UPDATE asset → INSERT lifecycle_log → INSERT outbox_event.
Returns: (success, new_version, idempotent, error_message)';
