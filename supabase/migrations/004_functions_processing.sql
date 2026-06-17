-- Content Core — SQL Migration 004
-- Processing job DAG functions
-- Created: 2024-01-01

-- ============================================================================
-- FUNCTION: ensure_required_processing_graph
-- ============================================================================
-- Creates DAG of processing jobs based on mime_type
-- Idempotent via UNIQUE (asset_id, job_type) constraint
-- ============================================================================

CREATE OR REPLACE FUNCTION ensure_required_processing_graph(
  p_asset_id UUID,
  p_mime_type TEXT
)
RETURNS TABLE (
  job_id UUID,
  job_type TEXT,
  status TEXT,
  is_required BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jobs_created INT := 0;
  v_probe_job_id UUID;
BEGIN
  -- Create PROBE job (required for all asset types)
  INSERT INTO processing_jobs (asset_id, job_type, status, is_required, queued_at)
  VALUES (p_asset_id, 'PROBE', 'QUEUED', TRUE, NOW())
  ON CONFLICT (asset_id, job_type) DO NOTHING
  RETURNING id INTO v_probe_job_id;

  IF v_probe_job_id IS NOT NULL THEN
    v_jobs_created := v_jobs_created + 1;
  END IF;

  -- Create type-specific jobs based on mime_type
  IF p_mime_type LIKE 'image/%' THEN
    -- Image: PROBE → THUMBNAIL (required) → BLURHASH (optional)
    INSERT INTO processing_jobs (asset_id, job_type, status, is_required, queued_at)
    VALUES (p_asset_id, 'THUMBNAIL', 'QUEUED', TRUE, NOW())
    ON CONFLICT (asset_id, job_type) DO NOTHING;

    INSERT INTO processing_jobs (asset_id, job_type, status, is_required, queued_at)
    VALUES (p_asset_id, 'BLURHASH', 'QUEUED', FALSE, NOW())
    ON CONFLICT (asset_id, job_type) DO NOTHING;

    -- Create DAG edges: PROBE → THUMBNAIL, PROBE → BLURHASH
    IF v_probe_job_id IS NOT NULL THEN
      INSERT INTO processing_job_edges (parent_job_id, child_job_id)
      SELECT v_probe_job_id, j.id
      FROM processing_jobs j
      WHERE j.asset_id = p_asset_id AND j.job_type IN ('THUMBNAIL', 'BLURHASH')
      ON CONFLICT DO NOTHING;
    END IF;

  ELSIF p_mime_type LIKE 'video/%' THEN
    -- Video: PROBE → COVER (required), PROBE → TRANSCODE (required) → CAPTIONS (optional), WAVEFORM (optional)
    INSERT INTO processing_jobs (asset_id, job_type, status, is_required, queued_at)
    VALUES (p_asset_id, 'COVER', 'QUEUED', TRUE, NOW()),
           (p_asset_id, 'TRANSCODE', 'QUEUED', TRUE, NOW()),
           (p_asset_id, 'WAVEFORM', 'QUEUED', FALSE, NOW())
    ON CONFLICT (asset_id, job_type) DO NOTHING;

    -- PROBE → COVER, PROBE → TRANSCODE, PROBE → WAVEFORM
    IF v_probe_job_id IS NOT NULL THEN
      INSERT INTO processing_job_edges (parent_job_id, child_job_id)
      SELECT v_probe_job_id, j.id
      FROM processing_jobs j
      WHERE j.asset_id = p_asset_id AND j.job_type IN ('COVER', 'TRANSCODE', 'WAVEFORM')
      ON CONFLICT DO NOTHING;
    END IF;

  ELSIF p_mime_type LIKE 'audio/%' THEN
    -- Audio: PROBE → WAVEFORM (required)
    INSERT INTO processing_jobs (asset_id, job_type, status, is_required, queued_at)
    VALUES (p_asset_id, 'WAVEFORM', 'QUEUED', TRUE, NOW())
    ON CONFLICT (asset_id, job_type) DO NOTHING;

    IF v_probe_job_id IS NOT NULL THEN
      INSERT INTO processing_job_edges (parent_job_id, child_job_id)
      SELECT v_probe_job_id, j.id
      FROM processing_jobs j
      WHERE j.asset_id = p_asset_id AND j.job_type = 'WAVEFORM'
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- Return all jobs for this asset
  RETURN QUERY
  SELECT j.id, j.job_type, j.status, j.is_required
  FROM processing_jobs j
  WHERE j.asset_id = p_asset_id
  ORDER BY j.job_type;
END;
$$;

-- ============================================================================
-- FUNCTION: claim_next_processing_job
-- ============================================================================
-- FOR UPDATE SKIP LOCKED → status=IN_PROGRESS, lease_expires_at=NOW+seconds
-- ============================================================================

CREATE OR REPLACE FUNCTION claim_next_processing_job(
  p_worker_id TEXT,
  p_lease_seconds INT DEFAULT 30
)
RETURNS TABLE (
  job_id UUID,
  asset_id UUID,
  job_type TEXT,
  is_required BOOLEAN,
  attempt_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job_id UUID;
  v_asset_id UUID;
  v_job_type TEXT;
  v_is_required BOOLEAN;
  v_attempt_count INT;
BEGIN
  -- Find and claim the next available job
  -- Priority: required jobs first (is_required DESC), then by created_at ASC
  SELECT j.id, j.asset_id, j.job_type, j.is_required, j.attempt_count
  INTO v_job_id, v_asset_id, v_job_type, v_is_required, v_attempt_count
  FROM processing_jobs j
  WHERE j.status = 'QUEUED'
  AND (j.lease_expires_at IS NULL OR j.lease_expires_at < NOW())
  ORDER BY j.is_required DESC, j.priority DESC, j.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- If no job found, return empty
  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

  -- Claim the job
  UPDATE processing_jobs
  SET
    status = 'IN_PROGRESS',
    worker_id = p_worker_id,
    lease_expires_at = NOW() + (p_lease_seconds || ' seconds')::INTERVAL,
    started_at = NOW(),
    attempt_count = attempt_count + 1,
    updated_at = NOW()
  WHERE id = v_job_id;

  RETURN QUERY
  SELECT v_job_id, v_asset_id, v_job_type, v_is_required, v_attempt_count + 1;
END;
$$;

-- ============================================================================
-- FUNCTION: renew_processing_lease
-- ============================================================================

CREATE OR REPLACE FUNCTION renew_processing_lease(
  p_job_id UUID,
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
  UPDATE processing_jobs
  SET
    lease_expires_at = NOW() + (p_lease_seconds || ' seconds')::INTERVAL,
    updated_at = NOW()
  WHERE id = p_job_id
  AND worker_id = p_worker_id
  AND status = 'IN_PROGRESS';

  RETURN FOUND;
END;
$$;

-- ============================================================================
-- FUNCTION: complete_processing_job
-- ============================================================================

CREATE OR REPLACE FUNCTION complete_processing_job(
  p_job_id UUID,
  p_worker_id TEXT,
  p_output_path TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_asset_id UUID;
  v_is_required BOOLEAN;
BEGIN
  -- Only lock owner can complete
  UPDATE processing_jobs
  SET
    status = 'DONE',
    finished_at = NOW(),
    worker_id = NULL,
    lease_expires_at = NULL,
    updated_at = NOW()
  WHERE id = p_job_id
  AND worker_id = p_worker_id
  AND status = 'IN_PROGRESS';

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Check if all required jobs are complete
  SELECT asset_id, is_required INTO v_asset_id, v_is_required
  FROM processing_jobs
  WHERE id = p_job_id;

  -- If this was a required job, check if all required jobs are done
  IF v_is_required THEN
    IF NOT EXISTS (
      SELECT 1 FROM processing_jobs
      WHERE asset_id = v_asset_id
      AND is_required = TRUE
      AND status NOT IN ('DONE', 'SKIPPED')
    ) THEN
      -- All required jobs complete, mark asset as READY
      UPDATE assets
      SET
        status = 'READY',
        updated_at = NOW()
      WHERE id = v_asset_id
      AND status = 'PROCESSING';
    END IF;
  END IF;

  RETURN TRUE;
END;
$$;

-- ============================================================================
-- FUNCTION: fail_processing_job
-- ============================================================================

CREATE OR REPLACE FUNCTION fail_processing_job(
  p_job_id UUID,
  p_worker_id TEXT,
  p_error_message TEXT,
  p_max_attempts INT DEFAULT 3
)
RETURNS TABLE (
  success BOOLEAN,
  should_retry BOOLEAN,
  new_status TEXT,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_attempt INT;
  v_new_status TEXT;
  v_should_retry BOOLEAN;
BEGIN
  -- Get current attempt count
  SELECT attempt_count INTO v_current_attempt
  FROM processing_jobs
  WHERE id = p_job_id AND worker_id = p_worker_id AND status = 'IN_PROGRESS';

  IF v_current_attempt IS NULL THEN
    RETURN QUERY SELECT FALSE, FALSE, NULL::TEXT, 'Job not found or not owned by worker';
    RETURN;
  END IF;

  -- Check if should retry
  IF v_current_attempt < p_max_attempts THEN
    v_should_retry := TRUE;
    v_new_status := 'QUEUED';
  ELSE
    v_should_retry := FALSE;
    v_new_status := 'FAILED';
  END IF;

  -- Update job
  UPDATE processing_jobs
  SET
    status = v_new_status,
    last_error = p_error_message,
    worker_id = NULL,
    lease_expires_at = NULL,
    updated_at = NOW()
  WHERE id = p_job_id;

  RETURN QUERY SELECT TRUE, v_should_retry, v_new_status, NULL::TEXT;
END;
$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION ensure_required_processing_graph IS
'Creates DAG of processing jobs based on asset mime_type.
Images: PROBE→THUMBNAIL(required)→BLURHASH(optional)
Videos: PROBE→COVER(required), PROBE→TRANSCODE(required)→WAVEFORM(optional)
Audio: PROBE→WAVEFORM(required)
Idempotent via ON CONFLICT DO NOTHING';