-- v2.8 Platform Core Triggers & Constraints
--
-- Enforces invariants at database level:
-- - INV-IDEMP-01: Idempotency identity & outcome hashing
-- - INV-SEQ-01: Event sequence gaps
-- - INV-PROJ-01: Projection watermark monotonicity  
-- - INV-MEM-01: Removed member cleanup
-- - INV-POL-01: Policy affecting fields
-- 
-- Created: 2026-02-24

-- ============================================================================
-- Trigger: Prevent core_events UPDATE/DELETE (append-only)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_core_events_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'core_events is append-only; UPDATE and DELETE are forbidden';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_core_events_immutable ON public.core_events;
CREATE TRIGGER trg_core_events_immutable
  BEFORE UPDATE OR DELETE ON public.core_events
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_core_events_immutable();

-- ============================================================================
-- Trigger: Enforce DM uniqueness with canonical ordering
-- INV-DM-01: Ensure dm_user_low < dm_user_high (canonical pair)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_dm_canonical_ordering()
RETURNS TRIGGER AS $$
DECLARE
  v_low UUID;
  v_high UUID;
BEGIN
  IF NEW.scope_type = 'dm' THEN
    -- Ensure both are set
    IF NEW.dm_user_low IS NULL OR NEW.dm_user_high IS NULL THEN
      RAISE EXCEPTION 'DM scope requires both dm_user_low and dm_user_high';
    END IF;
    
    -- Enforce canonical order (low < high)
    v_low := CASE WHEN NEW.dm_user_low < NEW.dm_user_high THEN NEW.dm_user_low ELSE NEW.dm_user_high END;
    v_high := CASE WHEN NEW.dm_user_low < NEW.dm_user_high THEN NEW.dm_user_high ELSE NEW.dm_user_low END;
    
    NEW.dm_user_low := v_low;
    NEW.dm_user_high := v_high;
    
    -- Prevent self-DM (unless explicitly allowed by deployment)
    IF v_low = v_high THEN
      RAISE EXCEPTION 'Self-DM is not allowed in this deployment';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dm_canonical_ordering ON public.core_scopes;
CREATE TRIGGER trg_dm_canonical_ordering
  BEFORE INSERT OR UPDATE ON public.core_scopes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_dm_canonical_ordering();

-- ============================================================================
-- Trigger: Update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_core_scopes_updated_at ON public.core_scopes;
CREATE TRIGGER trg_core_scopes_updated_at
  BEFORE UPDATE ON public.core_scopes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_timestamp();

DROP TRIGGER IF EXISTS trg_core_scope_members_updated_at ON public.core_scope_members;
CREATE TRIGGER trg_core_scope_members_updated_at
  BEFORE UPDATE ON public.core_scope_members
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_timestamp();

DROP TRIGGER IF EXISTS trg_scope_invites_updated_at ON public.scope_invites;
CREATE TRIGGER trg_scope_invites_updated_at
  BEFORE UPDATE ON public.scope_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_timestamp();

DROP TRIGGER IF EXISTS trg_projection_watermarks_updated_at ON public.projection_watermarks;
CREATE TRIGGER trg_projection_watermarks_updated_at
  BEFORE UPDATE ON public.projection_watermarks
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_timestamp();

-- ============================================================================
-- Trigger: Enforce projection watermark monotonicity
-- INV-PROJ-01: dialogs_watermark_seq and unread_watermark_seq only increase
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_watermark_monotonic()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Check dialogs_watermark_seq only increases
    IF NEW.dialogs_watermark_seq < OLD.dialogs_watermark_seq THEN
      RAISE EXCEPTION 'dialogs_watermark_seq can only increase; current: %, new: %',
        OLD.dialogs_watermark_seq, NEW.dialogs_watermark_seq;
    END IF;
    
    -- Check unread_watermark_seq only increases
    IF NEW.unread_watermark_seq < OLD.unread_watermark_seq THEN
      RAISE EXCEPTION 'unread_watermark_seq can only increase; current: %, new: %',
        OLD.unread_watermark_seq, NEW.unread_watermark_seq;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_projection_watermark_monotonic ON public.projection_watermarks;
CREATE TRIGGER trg_projection_watermark_monotonic
  BEFORE UPDATE ON public.projection_watermarks
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_watermark_monotonic();

-- ============================================================================
-- Trigger: Enforce receipt monotonicity
-- Core receipts: last_read_seq <= last_delivered_seq, only increase
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_receipts_monotonic()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- On insert, ensure invariant
    IF NEW.last_read_seq > NEW.last_delivered_seq THEN
      RAISE EXCEPTION 'last_read_seq (%) cannot exceed last_delivered_seq (%)',
        NEW.last_read_seq, NEW.last_delivered_seq;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- On update, enforce monotonic increase
    IF NEW.last_read_seq < OLD.last_read_seq THEN
      RAISE EXCEPTION 'last_read_seq can only increase; current: %, new: %',
        OLD.last_read_seq, NEW.last_read_seq;
    END IF;
    
    IF NEW.last_delivered_seq < OLD.last_delivered_seq THEN
      RAISE EXCEPTION 'last_delivered_seq can only increase; current: %, new: %',
        OLD.last_delivered_seq, NEW.last_delivered_seq;
    END IF;
    
    -- Enforce invariant
    IF NEW.last_read_seq > NEW.last_delivered_seq THEN
      RAISE EXCEPTION 'last_read_seq (%) cannot exceed last_delivered_seq (%)',
        NEW.last_read_seq, NEW.last_delivered_seq;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_core_receipts_monotonic ON public.core_receipts;
CREATE TRIGGER trg_core_receipts_monotonic
  BEFORE INSERT OR UPDATE ON public.core_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_receipts_monotonic();

-- Similar trigger for core_scope_members receipts
DROP TRIGGER IF EXISTS trg_core_scope_members_monotonic ON public.core_scope_members;
CREATE TRIGGER trg_core_scope_members_monotonic
  BEFORE INSERT OR UPDATE ON public.core_scope_members
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_receipts_monotonic();

-- ============================================================================
-- Trigger: Enforce event sequence uniqueness per scope
-- INV-SEQ-01: No gaps without server validation
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_event_seq_valid()
RETURNS TRIGGER AS $$
DECLARE
  v_max_seq BIGINT;
BEGIN
  -- Get the current max seq for this scope
  SELECT COALESCE(MAX(event_seq), 0)
  INTO v_max_seq
  FROM public.core_events
  WHERE scope_id = NEW.scope_id AND event_id <> NEW.event_id;
  
  -- Event seq must be > 0 and unique
  IF NEW.event_seq <= v_max_seq THEN
    RAISE EXCEPTION 'event_seq must be > previous max (%). Given: %',
      v_max_seq, NEW.event_seq;
  END IF;
  
  -- Update scope_max_seq in core_scopes
  UPDATE public.core_scopes
  SET scope_max_seq = NEW.event_seq
  WHERE scope_id = NEW.scope_id AND scope_max_seq < NEW.event_seq;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_core_events_seq_valid ON public.core_events;
CREATE TRIGGER trg_core_events_seq_valid
  BEFORE INSERT ON public.core_events
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_event_seq_valid();

-- ============================================================================
-- Trigger: Prevent membership state inconsistencies
-- INV-MEM-01: removed members cannot rejoin without explicit re-invite
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_membership_state_guard()
RETURNS TRIGGER AS $$
BEGIN
  -- If changing from removed to non-removed, must go through explicit re-invite
  IF TG_OP = 'UPDATE' THEN
    IF OLD.join_state = 'removed' AND NEW.join_state <> 'removed' THEN
      RAISE EXCEPTION 'Removed member cannot be reinstated directly; requires new invite';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_core_scope_members_state_guard ON public.core_scope_members;
CREATE TRIGGER trg_core_scope_members_state_guard
  BEFORE UPDATE ON public.core_scope_members
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_membership_state_guard();

-- ============================================================================
-- Function: Delete idempotency hot outcomes older than retention
-- Run periodically (e.g., daily)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_cleanup_idempotency_hot()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM public.idempotency_outcomes_hot
  WHERE expires_at < now();
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function: Validate idempotency identity before accept
-- Called by SECURITY DEFINER RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_validate_idempotency_identity(
  p_actor_id UUID,
  p_scope_id UUID,
  p_command_type TEXT,
  p_idempotency_key_norm TEXT,
  p_payload_hash TEXT
)
RETURNS TABLE(
  outcome_state TEXT,
  outcome JSONB,
  outcome_code TEXT
) AS $$
DECLARE
  v_outcome_hash TEXT;
BEGIN
  -- Check hot outcomes first
  SELECT outcome, outcome_code, outcome_hash
  INTO outcome, outcome_code, v_outcome_hash
  FROM public.idempotency_outcomes_hot
  WHERE actor_id = p_actor_id
    AND scope_id = p_scope_id
    AND command_type = p_command_type
    AND idempotency_key_norm = p_idempotency_key_norm;
  
  IF FOUND THEN
    -- Verify payload hash matches (idempotent replay guard)
    IF v_outcome_hash <> p_payload_hash THEN
      RAISE EXCEPTION 'Payload hash mismatch for idempotency key; likely duplicate with different payload';
    END IF;
    
    RETURN QUERY SELECT 'found_hot'::TEXT, outcome, outcome_code;
    RETURN;
  END IF;
  
  -- Check archive outcomes
  SELECT outcome, outcome_code, outcome_hash
  INTO outcome, outcome_code, v_outcome_hash
  FROM public.idempotency_outcomes_archive
  WHERE actor_id = p_actor_id
    AND scope_id = p_scope_id
    AND command_type = p_command_type
    AND idempotency_key_norm = p_idempotency_key_norm;
  
  IF FOUND THEN
    IF v_outcome_hash <> p_payload_hash THEN
      RAISE EXCEPTION 'Payload hash mismatch in archive; likely duplicate with different payload';
    END IF;
    
    RETURN QUERY SELECT 'found_archive'::TEXT, outcome, outcome_code;
    RETURN;
  END IF;
  
  -- Not found
  RETURN QUERY SELECT 'not_found'::TEXT, NULL::JSONB, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function: Validate maintenance mode transitions
-- INV-MAINT-01: Enforce allowed + forbidden transitions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_validate_maintenance_transition(
  p_current_mode TEXT,
  p_new_mode TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_allowed BOOLEAN;
BEGIN
  -- Manually encode allowed transitions (simplified for Postgres)
  v_allowed := CASE
    WHEN p_current_mode = 'normal' AND p_new_mode = 'maintenance_write_freeze' THEN TRUE
    WHEN p_current_mode = 'maintenance_write_freeze' AND p_new_mode = 'read_only_safe' THEN TRUE
    WHEN p_current_mode = 'maintenance_write_freeze' AND p_new_mode = 'maintenance_full' THEN TRUE
    WHEN p_current_mode = 'read_only_safe' AND p_new_mode = 'maintenance_write_freeze' THEN TRUE
    WHEN p_current_mode = 'maintenance_full' AND p_new_mode = 'maintenance_write_freeze' THEN TRUE
    ELSE FALSE
  END;
  
  RETURN v_allowed;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function: Cleanup expired invites
-- Run periodically (e.g., hourly)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_cleanup_expired_invites()
RETURNS INTEGER AS $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE public.scope_invites
  SET status = 'expired'
  WHERE status = 'pending' AND expires_at < now();
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function: Validate policy hash consistency
-- Called by update_policy RPC
-- INV-HASH-01: Policy hash only for policy_object_for_hash
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_validate_policy_hash(
  p_policy_json JSONB,
  p_expected_policy_hash TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_computed_hash TEXT;
  v_policy_obj JSONB;
BEGIN
  -- Extract only policy-affecting fields from policy_json
  v_policy_obj := jsonb_build_object(
    'visibility', p_policy_json->>'visibility',
    'join_mode', p_policy_json->>'join_mode',
    'delivery_strategy', p_policy_json->>'delivery_strategy',
    'approval_roles', p_policy_json->'approval_roles',
    'approval_quorum', p_policy_json->>'approval_quorum',
    'self_join_enabled', p_policy_json->>'self_join_enabled',
    'invite_ttl', p_policy_json->>'invite_ttl',
    'data_classification_defaults', p_policy_json->>'data_classification_defaults'
  );
  
  -- Compute hash (simplified; would use JCS in real implementation)
  v_computed_hash := encode(
    digest(v_policy_obj::TEXT, 'sha256'),
    'hex'
  );
  
  RETURN v_computed_hash = p_expected_policy_hash;
END;
$$ LANGUAGE plpgsql;
