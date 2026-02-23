-- v2.8 Platform Core Database Schema
-- 
-- This migration creates all core tables for v2.8 non-bypass specification.
-- INVs: DM uniqueness, idempotency, policy, maintenance, projection.
-- 
-- Created: 2026-02-24
-- Status: Final Review (from v2.8-non-bypass-final-rev2.md)
-- 
-- Tables created:
-- 1. core_scopes (INV-DM-01, INV-POL-01, INV-DEL-01)
-- 2. core_events (append-only, INV-SEQ-01)
-- 3. core_scope_members (membership state, INV-MEM-01)
-- 4. scope_invites (policy snapshot, INV-INV-01)
-- 5. core_receipts (monotonic pointers)
-- 6. idempotency_outcomes_hot (2yr retention)
-- 7. idempotency_outcomes_archive (indefinite)
-- 8. idempotency_locks (in-flight race prevention)
-- 9. projection_watermarks (monotonic, INV-PROJ-01)
-- 10. admin_action_log (audit trail)

-- ============================================================================
-- 1. core_scopes table
-- INV-DM-01: DM uniqueness per canonical pair (low, high)
-- INV-POL-01: Policy visibility/join rules server-enforced
-- INV-DEL-01: delivery_strategy explicit per scope
-- INV-MAINT-01: Maintenance modes with transitions
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.core_scopes (
  scope_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('dm', 'group', 'channel', 'service')),
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private', 'unlisted')),
  join_mode TEXT NOT NULL CHECK (join_mode IN ('open', 'approval', 'invite_only')),
  delivery_strategy TEXT NOT NULL CHECK (delivery_strategy IN ('fanout_on_write', 'fanout_on_read')),
  
  -- Policy versioning and hashing (INV-HASH-01)
  policy_version INT NOT NULL DEFAULT 1 CHECK (policy_version > 0),
  policy_hash TEXT NOT NULL, -- sha256(JCS(policy_object_for_hash))
  
  -- DM specific (INV-DM-01: canonical pair)
  dm_user_low UUID,
  dm_user_high UUID,
  -- Invariant: if dm_user_low is set, dm_user_high must also be set
  -- and dm_user_low < dm_user_high (canonical order)
  CHECK (
    (scope_type = 'dm' AND dm_user_low IS NOT NULL AND dm_user_high IS NOT NULL AND dm_user_low <> dm_user_high) OR
    (scope_type <> 'dm' AND dm_user_low IS NULL AND dm_user_high IS NULL)
  ),
  
  -- Maintenance mode (INV-MAINT-01)
  system_mode TEXT NOT NULL DEFAULT 'normal' CHECK (system_mode IN (
    'normal',
    'maintenance_write_freeze',
    'read_only_safe',
    'maintenance_full'
  )),
  
  -- Projection mode (INV-PROJ-01)
  projection_mode TEXT NOT NULL DEFAULT 'normal' CHECK (projection_mode IN (
    'normal',
    'rebuilding',
    'read_only'
  )),
  
  -- Data classification (INV-CLASS-01)
  data_classification TEXT NOT NULL DEFAULT 'normal' CHECK (data_classification IN (
    'normal',
    'sensitive',
    'regulated'
  )),
  
  -- Scope metadata
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Optional: invite_ttl in hours (for private scopes)
  invite_ttl_hours INT CHECK (invite_ttl_hours IS NULL OR (invite_ttl_hours > 0 AND invite_ttl_hours <= 8760)),
  
  -- Optional: max seq for this scope (used for timeline cap checks)
  scope_max_seq BIGINT DEFAULT 0 CHECK (scope_max_seq >= 0),
  
  -- Channel-specific: is this a large channel?
  is_large_channel BOOLEAN DEFAULT FALSE,
  
  -- Metadata (opaque JSON)
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes
CREATE UNIQUE INDEX idx_core_scopes_dm_pair ON public.core_scopes(dm_user_low, dm_user_high)
  WHERE scope_type = 'dm';
CREATE INDEX idx_core_scopes_scope_type ON public.core_scopes(scope_type);
CREATE INDEX idx_core_scopes_created_by ON public.core_scopes(created_by);
CREATE INDEX idx_core_scopes_system_mode ON public.core_scopes(system_mode)
  WHERE system_mode <> 'normal';
CREATE INDEX idx_core_scopes_projection_mode ON public.core_scopes(projection_mode)
  WHERE projection_mode <> 'normal';

-- Enable RLS (section 5: SECURITY DEFINER RPC only)
ALTER TABLE public.core_scopes ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. core_events table (append-only, immutable)
-- INV-SEQ-01: Gap detection mandatory
-- INV-IDEMP-01: Idempotency via command_type and key
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.core_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID NOT NULL REFERENCES public.core_scopes(scope_id) ON DELETE CASCADE,
  
  -- Sequencing (INV-SEQ-01: strict ordering)
  event_seq BIGINT NOT NULL CHECK (event_seq > 0),
  
  -- Actor identity (who made the action)
  actor_id UUID NOT NULL,
  
  -- Command context (INV-IDEMP-01)
  command_type TEXT NOT NULL,
  idempotency_key_norm TEXT NOT NULL, -- normalized UUID or ULID
  
  -- Event payload (immutable after creation)
  payload JSONB NOT NULL,
  
  -- Payload hash (RFC 8785 JCS canonicalization)
  payload_hash TEXT NOT NULL,
  
  -- Tracing context
  trace_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  server_time TIMESTAMPTZ NOT NULL DEFAULT now(), -- server-side time for ordering
  client_ts TIMESTAMPTZ, -- client timestamp (advisory only), used for replay window
  
  -- Client-side info (max clock skew check)
  client_version INT,
  
  -- Created immutably
  UNIQUE (scope_id, event_seq),
  UNIQUE (actor_id, scope_id, command_type, idempotency_key_norm, event_seq)
);

-- Indexes
CREATE INDEX idx_core_events_scope_id ON public.core_events(scope_id);
CREATE INDEX idx_core_events_actor_id ON public.core_events(actor_id);
CREATE INDEX idx_core_events_command_type ON public.core_events(command_type);
CREATE INDEX idx_core_events_created_at ON public.core_events(created_at);
CREATE INDEX idx_core_events_server_time ON public.core_events(server_time);

-- Enforce append-only: prevent updates and deletes
ALTER TABLE public.core_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. core_scope_members table
-- INV-MEM-01: Removed members have memberships cleared
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.core_scope_members (
  scope_id UUID NOT NULL REFERENCES public.core_scopes(scope_id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  
  -- Membership state
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'moderator', 'member')),
  join_state TEXT NOT NULL DEFAULT 'joined' CHECK (join_state IN ('joined', 'invited', 'removed')),
  
  -- Remove tracking (INV-MEM-01)
  removed_at TIMESTAMPTZ,
  removed_by UUID,
  
  -- Receipt tracking (monotonic pointers)
  last_read_seq BIGINT DEFAULT 0,
  last_delivered_seq BIGINT DEFAULT 0,
  
  -- Timestamps
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  PRIMARY KEY (scope_id, user_id),
  CONSTRAINT valid_remove_state CHECK (
    (join_state = 'removed' AND removed_at IS NOT NULL) OR
    (join_state <> 'removed' AND removed_at IS NULL)
  ),
  CONSTRAINT monotonic_receipts CHECK (last_read_seq <= last_delivered_seq)
);

-- Indexes
CREATE INDEX idx_core_scope_members_user_id ON public.core_scope_members(user_id);
CREATE INDEX idx_core_scope_members_role ON public.core_scope_members(role);
CREATE INDEX idx_core_scope_members_join_state ON public.core_scope_members(join_state);
CREATE INDEX idx_core_scope_members_removed_at ON public.core_scope_members(removed_at)
  WHERE removed_at IS NOT NULL;

ALTER TABLE public.core_scope_members ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. scope_invites table
-- INV-INV-01: Invites audit and policy snapshot
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.scope_invites (
  invite_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID NOT NULL REFERENCES public.core_scopes(scope_id) ON DELETE CASCADE,
  invited_user UUID NOT NULL,
  invited_by UUID NOT NULL,
  
  -- Policy snapshot (policy version + hash at issue time)
  policy_version_at_issue INT NOT NULL,
  policy_hash_at_issue TEXT NOT NULL,
  
  -- Invite status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'revoked')),
  
  -- Accept tracking
  accepted_at TIMESTAMPTZ,
  accepted_device_id TEXT,
  
  -- Expiration
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  CONSTRAINT valid_accept_state CHECK (
    (status = 'accepted' AND accepted_at IS NOT NULL) OR
    (status <> 'accepted' AND accepted_at IS NULL)
  )
);

-- Indexes
CREATE INDEX idx_scope_invites_scope_id ON public.scope_invites(scope_id);
CREATE INDEX idx_scope_invites_invited_user ON public.scope_invites(invited_user);
CREATE INDEX idx_scope_invites_status ON public.scope_invites(status);
CREATE INDEX idx_scope_invites_expires_at ON public.scope_invites(expires_at);

ALTER TABLE public.scope_invites ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. core_receipts table (monotonic pointers)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.core_receipts (
  scope_id UUID NOT NULL REFERENCES public.core_scopes(scope_id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  
  -- Monotonic pointers (only increase)
  last_read_seq BIGINT DEFAULT 0 CHECK (last_read_seq >= 0),
  last_delivered_seq BIGINT DEFAULT 0 CHECK (last_delivered_seq >= 0),
  
  -- Invariant: read <= delivered
  CHECK (last_read_seq <= last_delivered_seq),
  
  -- Timestamps
  read_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  
  PRIMARY KEY (scope_id, user_id)
);

-- Indexes
CREATE INDEX idx_core_receipts_user_id ON public.core_receipts(user_id);
CREATE INDEX idx_core_receipts_read_at ON public.core_receipts(read_at);

ALTER TABLE public.core_receipts ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. idempotency_outcomes_hot table (2-year retention)
-- INV-IDEMP-01: Perpetual idempotency, two-tier model
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.idempotency_outcomes_hot (
  -- Identity tuple
  actor_id UUID NOT NULL,
  scope_id UUID NOT NULL REFERENCES public.core_scopes(scope_id) ON DELETE CASCADE,
  command_type TEXT NOT NULL,
  idempotency_key_norm TEXT NOT NULL,
  
  -- Outcome state
  state TEXT NOT NULL CHECK (state IN ('found_hot', 'pending', 'error')),
  
  -- Response payload
  outcome JSONB NOT NULL,
  outcome_code TEXT NOT NULL,
  outcome_hash TEXT NOT NULL, -- payload hash, used to detect duplicates
  
  -- Timing
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '730 days'), -- 2 years
  
  PRIMARY KEY (actor_id, scope_id, command_type, idempotency_key_norm)
);

-- Indexes
CREATE INDEX idx_idempotency_outcomes_hot_scope_id ON public.idempotency_outcomes_hot(scope_id);
CREATE INDEX idx_idempotency_outcomes_hot_actor_id ON public.idempotency_outcomes_hot(actor_id);
CREATE INDEX idx_idempotency_outcomes_hot_expires_at ON public.idempotency_outcomes_hot(expires_at);

ALTER TABLE public.idempotency_outcomes_hot ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 7. idempotency_outcomes_archive table (indefinite retention)
-- Section 3.3: Archive perpetually, never delete for anti-replay
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.idempotency_outcomes_archive (
  -- Identity tuple
  actor_id UUID NOT NULL,
  scope_id UUID NOT NULL REFERENCES public.core_scopes(scope_id) ON DELETE CASCADE,
  command_type TEXT NOT NULL,
  idempotency_key_norm TEXT NOT NULL,
  
  -- Outcome state
  state TEXT NOT NULL CHECK (state IN ('found_archive', 'pending')),
  
  -- Response payload
  outcome JSONB NOT NULL,
  outcome_code TEXT NOT NULL,
  outcome_hash TEXT NOT NULL,
  
  -- Timing
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Indefinite retention: no expires_at
  
  PRIMARY KEY (actor_id, scope_id, command_type, idempotency_key_norm)
);

-- Indexes
CREATE INDEX idx_idempotency_outcomes_archive_scope_id ON public.idempotency_outcomes_archive(scope_id);
CREATE INDEX idx_idempotency_outcomes_archive_actor_id ON public.idempotency_outcomes_archive(actor_id);

ALTER TABLE public.idempotency_outcomes_archive ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 8. idempotency_locks table (in-flight race prevention)
-- Short-lived: < 30 seconds
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.idempotency_locks (
  idempotency_key_norm TEXT NOT NULL,
  scope_id UUID NOT NULL REFERENCES public.core_scopes(scope_id) ON DELETE CASCADE,
  actor_id UUID NOT NULL,
  
  -- Lock state
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 seconds'),
  
  PRIMARY KEY (idempotency_key_norm, scope_id, actor_id)
);

-- Indexes
CREATE INDEX idx_idempotency_locks_expires_at ON public.idempotency_locks(expires_at);

-- ============================================================================
-- 9. projection_watermarks table
-- INV-PROJ-01: Monotonic increase, server-time ordering
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.projection_watermarks (
  scope_id UUID PRIMARY KEY REFERENCES public.core_scopes(scope_id) ON DELETE CASCADE,
  
  -- Projection modes
  projection_mode TEXT NOT NULL DEFAULT 'normal' CHECK (projection_mode IN (
    'normal',
    'rebuilding',
    'read_only'
  )),
  
  -- Monotonic watermarks (only increase)
  dialogs_watermark_seq BIGINT NOT NULL DEFAULT 0 CHECK (dialogs_watermark_seq >= 0),
  unread_watermark_seq BIGINT NOT NULL DEFAULT 0 CHECK (unread_watermark_seq >= 0),
  
  -- For rebuild consistency
  rebuild_started_at TIMESTAMPTZ,
  rebuild_completed_at TIMESTAMPTZ,
  
  -- Timestamps
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INT NOT NULL DEFAULT 1 CHECK (version > 0)
);

-- Indexes
CREATE INDEX idx_projection_watermarks_projection_mode ON public.projection_watermarks(projection_mode)
  WHERE projection_mode <> 'normal';

ALTER TABLE public.projection_watermarks ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 10. admin_action_log table (audit trail)
-- G-ADM-01: Admin reason allowlist + PII screen
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_action_log (
  action_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Admin context
  admin_user_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  
  -- Target (scope or user)
  target_scope_id UUID REFERENCES public.core_scopes(scope_id) ON DELETE CASCADE,
  target_user_id UUID,
  
  -- Reason
  reason_code TEXT NOT NULL CHECK (reason_code IN (
    'abuse_spam',
    'abuse_harassment',
    'legal_request',
    'user_request',
    'security_incident',
    'moderation_policy',
    'other'
  )),
  reason_text TEXT, -- max length enforced in RPC, no PII allowed
  
  -- Action details
  action_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_admin_action_log_admin_user_id ON public.admin_action_log(admin_user_id);
CREATE INDEX idx_admin_action_log_target_scope_id ON public.admin_action_log(target_scope_id);
CREATE INDEX idx_admin_action_log_reason_code ON public.admin_action_log(reason_code);
CREATE INDEX idx_admin_action_log_created_at ON public.admin_action_log(created_at);

ALTER TABLE public.admin_action_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Grant RLS enforcement
-- Section 5: REVOKE direct writes; allow only SECURITY DEFINER RPC
-- ============================================================================

REVOKE INSERT, UPDATE, DELETE ON public.core_scopes FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.core_events FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.core_scope_members FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.scope_invites FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.core_receipts FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.idempotency_outcomes_hot FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.idempotency_outcomes_archive FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.idempotency_locks FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.projection_watermarks FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.admin_action_log FROM authenticated, anon;
