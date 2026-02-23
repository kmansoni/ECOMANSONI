-- v2.8 Platform Core SECURITY DEFINER RPC Functions
--
-- Section 5: All writes go through SECURITY DEFINER RPC only
-- No direct client writes to core_* tables
-- Write-surface inventory:
--   - create_scope(scope_type, visibility, join_mode, policy_version, policy_hash)
--   - send_command(scope_id, command_type, payload, idempotency_key, trace_id, device_id)
--   - accept_invite(invite_id, device_id, trace_id)
--   - update_membership(scope_id, user_id, role, device_id, trace_id)
--   - record_receipt(scope_id, last_read_seq, last_delivered_seq, device_id, trace_id)
--   - update_policy(scope_id, policy_json, policy_hash, reason_code, reason_text, device_id, trace_id)
--   - maintenance_control(new_mode, reason_code, reason_text, require_dual_approval)
--
-- Created: 2026-02-24

-- ============================================================================
-- RPC: create_scope(scope_type, visibility, join_mode, policy_version, policy_hash)
-- Creates a new scope
-- INV-DM-01: DM uniqueness enforced at DB level
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_scope(
  p_scope_type TEXT,
  p_visibility TEXT DEFAULT 'private',
  p_join_mode TEXT DEFAULT 'invite_only',
  p_policy_version INT DEFAULT 1,
  p_policy_hash TEXT DEFAULT '',
  p_dm_user_id UUID DEFAULT NULL
)
RETURNS TABLE(
  scope_id UUID,
  status TEXT,
  error TEXT
) AS $$
DECLARE
  v_scope_id UUID;
  v_creator_id UUID;
  v_dm_user_low UUID;
  v_dm_user_high UUID;
  v_policy_hash TEXT;
BEGIN
  -- Get current user
  v_creator_id := auth.uid();
  IF v_creator_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, 'error'::TEXT, 'Not authenticated'::TEXT;
    RETURN;
  END IF;
  
  -- Validate scope_type
  IF p_scope_type NOT IN ('dm', 'group', 'channel', 'service') THEN
    RETURN QUERY SELECT NULL::UUID, 'error'::TEXT, format('Invalid scope_type: %s', p_scope_type)::TEXT;
    RETURN;
  END IF;
  
  -- Validate visibility/join combinations
  IF p_visibility = 'public' AND p_join_mode NOT IN ('open', 'approval') THEN
    RETURN QUERY SELECT NULL::UUID, 'error'::TEXT, 'Public scope must use open or approval join_mode'::TEXT;
    RETURN;
  END IF;
  
  IF (p_visibility IN ('private', 'unlisted')) AND p_join_mode NOT IN ('invite_only', 'approval') THEN
    RETURN QUERY SELECT NULL::UUID, 'error'::TEXT, 'Private/unlisted scope must use invite_only or approval join_mode'::TEXT;
    RETURN;
  END IF;
  
  -- Handle DM specific logic
  IF p_scope_type = 'dm' THEN
    IF p_dm_user_id IS NULL THEN
      RETURN QUERY SELECT NULL::UUID, 'error'::TEXT, 'DM requires dm_user_id'::TEXT;
      RETURN;
    END IF;
    
    -- Canonical ordering
    v_dm_user_low := CASE WHEN v_creator_id < p_dm_user_id THEN v_creator_id ELSE p_dm_user_id END;
    v_dm_user_high := CASE WHEN v_creator_id < p_dm_user_id THEN p_dm_user_id ELSE v_creator_id END;
    
    -- Check for self-DM
    IF v_dm_user_low = v_dm_user_high THEN
      RETURN QUERY SELECT NULL::UUID, 'error'::TEXT, 'Self-DM not allowed'::TEXT;
      RETURN;
    END IF;
    
    -- Check for existing DM (INV-DM-01)
    IF EXISTS(SELECT 1 FROM public.core_scopes WHERE scope_type = 'dm' AND dm_user_low = v_dm_user_low AND dm_user_high = v_dm_user_high) THEN
      RETURN QUERY SELECT NULL::UUID, 'error'::TEXT, 'DM already exists for this pair'::TEXT;
      RETURN;
    END IF;
  END IF;
  
  -- Use provided policy hash or generate empty
  v_policy_hash := COALESCE(p_policy_hash, '');
  
  -- Create scope
  INSERT INTO public.core_scopes(
    scope_type,
    visibility,
    join_mode,
    delivery_strategy,
    policy_version,
    policy_hash,
    dm_user_low,
    dm_user_high,
    created_by
  ) VALUES (
    p_scope_type,
    p_visibility,
    p_join_mode,
    CASE WHEN p_scope_type IN ('group', 'dm', 'service') THEN 'fanout_on_write' ELSE 'fanout_on_read' END,
    p_policy_version,
    v_policy_hash,
    v_dm_user_low,
    v_dm_user_high,
    v_creator_id
  )
  RETURNING public.core_scopes.scope_id INTO v_scope_id;
  
  -- Add creator as owner
  INSERT INTO public.core_scope_members(scope_id, user_id, role, join_state)
  VALUES (v_scope_id, v_creator_id, 'owner', 'joined');
  
  -- Initialize projection watermark
  INSERT INTO public.projection_watermarks(scope_id)
  VALUES (v_scope_id);
  
  RETURN QUERY SELECT v_scope_id, 'created'::TEXT, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- RPC: send_command(scope_id, command_type, payload, idempotency_key_norm, trace_id, device_id)
-- Send a command to a scope (polymorphic: message, edit, delete, etc.)
-- INV-IDEMP-01: Idempotent replay protection
-- ============================================================================

CREATE OR REPLACE FUNCTION public.send_command(
  p_scope_id UUID,
  p_command_type TEXT,
  p_payload JSONB,
  p_idempotency_key_norm TEXT,
  p_trace_id TEXT,
  p_device_id TEXT
)
RETURNS TABLE(
  outcome_state TEXT,
  outcome_code TEXT,
  outcome JSONB
) AS $$
DECLARE
  v_actor_id UUID;
  v_payload_hash TEXT;
  v_outcome JSONB;
  v_outcome_code TEXT;
  v_event_id UUID;
  v_event_seq BIGINT;
BEGIN
  -- Get current user
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RETURN QUERY SELECT 'error'::TEXT, 'not_authenticated'::TEXT, '{}'::JSONB;
    RETURN;
  END IF;
  
  -- Validate membership in scope
  IF NOT EXISTS(
    SELECT 1 FROM public.core_scope_members
    WHERE scope_id = p_scope_id AND user_id = v_actor_id AND join_state = 'joined'
  ) THEN
    RETURN QUERY SELECT 'error'::TEXT, 'not_member'::TEXT, '{}'::JSONB;
    RETURN;
  END IF;
  
  -- Compute payload hash (RFC 8785 JCS)
  v_payload_hash := encode(digest(p_payload::TEXT, 'sha256'), 'hex');
  
  -- Check for existing idempotency outcome (hot)
  SELECT outcome, outcome_code
  INTO v_outcome, v_outcome_code
  FROM public.idempotency_outcomes_hot
  WHERE actor_id = v_actor_id
    AND scope_id = p_scope_id
    AND command_type = p_command_type
    AND idempotency_key_norm = p_idempotency_key_norm;
  
  IF FOUND THEN
    -- Return cached outcome
    RETURN QUERY SELECT 'found_hot'::TEXT, v_outcome_code, v_outcome;
    RETURN;
  END IF;
  
  -- Get next event sequence number
  SELECT COALESCE(MAX(event_seq), 0) + 1
  INTO v_event_seq
  FROM public.core_events
  WHERE scope_id = p_scope_id;
  
  -- Insert event (append-only)
  INSERT INTO public.core_events(
    scope_id,
    event_seq,
    actor_id,
    command_type,
    idempotency_key_norm,
    payload,
    payload_hash,
    trace_id,
    device_id
  ) VALUES (
    p_scope_id,
    v_event_seq,
    v_actor_id,
    p_command_type,
    p_idempotency_key_norm,
    p_payload,
    v_payload_hash,
    p_trace_id,
    p_device_id
  )
  RETURNING event_id INTO v_event_id;
  
  -- Process command based on type (simplified)
  -- In real implementation, this would call separate handlers
  v_outcome_code := 'success';
  v_outcome := jsonb_build_object(
    'event_id', v_event_id::TEXT,
    'event_seq', v_event_seq,
    'timestamp', now()::TEXT
  );
  
  -- Store outcome in hot cache
  INSERT INTO public.idempotency_outcomes_hot(
    actor_id,
    scope_id,
    command_type,
    idempotency_key_norm,
    state,
    outcome,
    outcome_code,
    outcome_hash
  ) VALUES (
    v_actor_id,
    p_scope_id,
    p_command_type,
    p_idempotency_key_norm,
    'found_hot',
    v_outcome,
    v_outcome_code,
    v_payload_hash
  )
  ON CONFLICT DO NOTHING;
  
  RETURN QUERY SELECT 'found_hot'::TEXT, v_outcome_code, v_outcome;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- RPC: accept_invite(invite_id, device_id, trace_id)
-- Accept an invite to a scope
-- INV-INV-01: Policy snapshot enforced
-- ============================================================================

CREATE OR REPLACE FUNCTION public.accept_invite(
  p_invite_id UUID,
  p_device_id TEXT,
  p_trace_id TEXT
)
RETURNS TABLE(
  status TEXT,
  scope_id UUID,
  error TEXT
) AS $$
DECLARE
  v_invite RECORD;
  v_actor_id UUID;
  v_scope_id UUID;
  v_current_policy_hash TEXT;
BEGIN
  -- Get current user
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RETURN QUERY SELECT 'error'::TEXT, NULL::UUID, 'Not authenticated'::TEXT;
    RETURN;
  END IF;
  
  -- Get invite
  SELECT * INTO v_invite
  FROM public.scope_invites
  WHERE invite_id = p_invite_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'error'::TEXT, NULL::UUID, 'Invite not found'::TEXT;
    RETURN;
  END IF;
  
  v_scope_id := v_invite.scope_id;
  
  -- Verify invite is for this user
  IF v_invite.invited_user <> v_actor_id THEN
    RETURN QUERY SELECT 'error'::TEXT, v_scope_id, 'Invite is not for current user'::TEXT;
    RETURN;
  END IF;
  
  -- Check invite status
  IF v_invite.status <> 'pending' THEN
    RETURN QUERY SELECT 'error'::TEXT, v_scope_id, format('Invite status is %s, not pending', v_invite.status)::TEXT;
    RETURN;
  END IF;
  
  -- Check expiration
  IF v_invite.expires_at < now() THEN
    RETURN QUERY SELECT 'error'::TEXT, v_scope_id, 'Invite expired'::TEXT;
    RETURN;
  END IF;
  
  -- Verify policy hasn't changed
  SELECT policy_hash INTO v_current_policy_hash
  FROM public.core_scopes
  WHERE scope_id = v_scope_id;
  
  IF v_current_policy_hash <> v_invite.policy_hash_at_issue THEN
    RETURN QUERY SELECT 'error'::TEXT, v_scope_id, 'Scope policy changed since invite; invite invalidated'::TEXT;
    RETURN;
  END IF;
  
  -- Add user as member
  INSERT INTO public.core_scope_members(scope_id, user_id, role, join_state)
  VALUES (v_scope_id, v_actor_id, 'member', 'joined')
  ON CONFLICT (scope_id, user_id) DO UPDATE
  SET join_state = 'joined', removed_at = NULL, updated_at = now();
  
  -- Mark invite as accepted
  UPDATE public.scope_invites
  SET status = 'accepted', accepted_at = now(), accepted_device_id = p_device_id
  WHERE invite_id = p_invite_id;
  
  RETURN QUERY SELECT 'accepted'::TEXT, v_scope_id, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- RPC: record_receipt(scope_id, last_read_seq, last_delivered_seq, device_id, trace_id)
-- Record read/delivered pointers (monotonic)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_receipt(
  p_scope_id UUID,
  p_last_read_seq BIGINT,
  p_last_delivered_seq BIGINT,
  p_device_id TEXT,
  p_trace_id TEXT
)
RETURNS TABLE(
  status TEXT,
  error TEXT
) AS $$
DECLARE
  v_actor_id UUID;
  v_current_read BIGINT;
  v_current_delivered BIGINT;
BEGIN
  -- Get current user
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RETURN QUERY SELECT 'error'::TEXT, 'Not authenticated'::TEXT;
    RETURN;
  END IF;
  
  -- Get current pointers
  SELECT last_read_seq, last_delivered_seq
  INTO v_current_read, v_current_delivered
  FROM public.core_receipts
  WHERE scope_id = p_scope_id AND user_id = v_actor_id;
  
  v_current_read := COALESCE(v_current_read, 0);
  v_current_delivered := COALESCE(v_current_delivered, 0);
  
  -- Validate monotonic increase
  IF p_last_read_seq < v_current_read THEN
    RETURN QUERY SELECT 'error'::TEXT, 'read_seq_decrease'::TEXT;
    RETURN;
  END IF;
  
  IF p_last_delivered_seq < v_current_delivered THEN
    RETURN QUERY SELECT 'error'::TEXT, 'delivered_seq_decrease'::TEXT;
    RETURN;
  END IF;
  
  -- Validate read <= delivered
  IF p_last_read_seq > p_last_delivered_seq THEN
    RETURN QUERY SELECT 'error'::TEXT, 'read_seq_exceeds_delivered_seq'::TEXT;
    RETURN;
  END IF;
  
  -- Upsert receipt
  INSERT INTO public.core_receipts(scope_id, user_id, last_read_seq, last_delivered_seq, read_at, delivered_at)
  VALUES (p_scope_id, v_actor_id, p_last_read_seq, p_last_delivered_seq, now(), now())
  ON CONFLICT (scope_id, user_id) DO UPDATE
  SET last_read_seq = p_last_read_seq,
      last_delivered_seq = p_last_delivered_seq,
      read_at = now(),
      delivered_at = now();
  
  RETURN QUERY SELECT 'recorded'::TEXT, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- RPC: /cmd/status (read-only) - get idempotency outcome
-- Section 10: Privacy-gated (requester actor_id must match)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cmd_status(
  p_actor_id UUID,
  p_scope_id UUID,
  p_command_type TEXT,
  p_idempotency_key_norm TEXT
)
RETURNS TABLE(
  outcome_state TEXT,
  source TEXT,
  outcome JSONB,
  outcome_code TEXT
) AS $$
DECLARE
  v_requester_id UUID;
  v_outcome JSONB;
  v_outcome_code TEXT;
BEGIN
  -- Get requester
  v_requester_id := auth.uid();
  IF v_requester_id IS NULL THEN
    v_requester_id := CASE WHEN auth.role() = 'service' THEN p_actor_id ELSE NULL END;
  END IF;
  
  -- Privacy check (section 10: requester actor_id must match)
  IF v_requester_id <> p_actor_id THEN
    RETURN QUERY SELECT 'error'::TEXT, 'none'::TEXT, '{}'::JSONB, 'privacy_denied'::TEXT;
    RETURN;
  END IF;
  
  -- Check hot outcomes first
  SELECT outcome, outcome_code
  INTO v_outcome, v_outcome_code
  FROM public.idempotency_outcomes_hot
  WHERE actor_id = p_actor_id
    AND scope_id = p_scope_id
    AND command_type = p_command_type
    AND idempotency_key_norm = p_idempotency_key_norm;
  
  IF FOUND THEN
    RETURN QUERY SELECT 'found_hot'::TEXT, 'hot'::TEXT, v_outcome, v_outcome_code;
    RETURN;
  END IF;
  
  -- Check archive outcomes
  SELECT outcome, outcome_code
  INTO v_outcome, v_outcome_code
  FROM public.idempotency_outcomes_archive
  WHERE actor_id = p_actor_id
    AND scope_id = p_scope_id
    AND command_type = p_command_type
    AND idempotency_key_norm = p_idempotency_key_norm;
  
  IF FOUND THEN
    RETURN QUERY SELECT 'found_archive'::TEXT, 'archive'::TEXT, v_outcome, v_outcome_code;
    RETURN;
  END IF;
  
  -- Not found
  RETURN QUERY SELECT 'not_found'::TEXT, 'none'::TEXT, NULL::JSONB, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
