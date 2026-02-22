-- Unified Decision Engine (Core)
-- Event sourcing + materialized views + versioned snapshots
-- Purpose: Single source of truth for trends, moderation, anti-abuse decisions

-- ============================================================================
-- 1. EVENT LOG (Immutable, append-only)
-- ============================================================================

create table if not exists decision_engine_events (
  id bigserial primary key,
  event_id uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  
  -- Event classification
  event_type text not null, -- 'hashtag_mentioned', 'hashtag_engagement', 'moderation_action', 'rollback_triggered'
  source_system text not null, -- 'reels', 'posts', 'comments', 'admin', 'system'
  
  -- Logical source
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000'::uuid, -- multi-tenant support
  subject_id text not null, -- hashtag, user_id, post_id, etc.
  subject_type text not null, -- 'hashtag', 'user', 'post', 'comment'
  
  -- Immutable payload
  payload jsonb not null, -- { created_at, author_id, engagement_count, ... }
  
  -- Determinism + replay
  algorithm_version text not null, -- 'trending-v1', 'moderation-v2', etc.
  execution_context jsonb not null default '{}', -- country, segment, feature_flags at time of event
  
  -- Idempotency
  idempotency_key text, -- For dedup. If NULL, always fresh.
  
  -- Audit
  actor_type text, -- 'system', 'user', 'admin'
  actor_id uuid,
  
  constraint events_source_system_chk check (source_system in ('reels', 'posts', 'comments', 'admin', 'system')),
  constraint events_event_type_chk check (event_type in ('hashtag_mentioned', 'hashtag_engagement', 'moderation_action', 'rollback_triggered', 'algorithm_update')),
  constraint events_subject_type_chk check (subject_type in ('hashtag', 'user', 'post', 'comment', 'segment'))
);

create index idx_events_event_id on decision_engine_events (event_id);
create index idx_events_subject on decision_engine_events (subject_type, subject_id);
create index idx_events_created_at on decision_engine_events (created_at desc);
create index idx_events_idempotency on decision_engine_events (idempotency_key) where idempotency_key is not null;

-- ============================================================================
-- 2. DECISION SNAPSHOTS (Versioned, immutable)
-- ============================================================================

create table if not exists decision_snapshots (
  id bigserial primary key,
  snapshot_id uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  
  -- Snapshot identity
  subject_type text not null, -- 'hashtag', 'segment_trend', 'user_reputation'
  subject_id text not null,
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000'::uuid,
  
  -- Version control
  version_number int not null, -- 1, 2, 3, ...
  algorithm_version text not null, -- exact version of decision logic
  snapshot_timestamp timestamptz not null, -- when was this computed
  
  -- Decision data (immutable)
  decision_type text not null, -- 'trend_score', 'moderation_status', 'user_trust_score'
  decision_payload jsonb not null, -- { score, reasons, confidence, metadata }
  
  -- Determinism + Replay
  source_events jsonb not null, -- array of event_ids used in computation
  content_hash text not null, -- SHA256(algorithm_version + source_events + input context)
  
  -- Confidence & validity
  confidence_score float not null, -- 0.0 .. 1.0
  trust_weight float not null default 1.0, -- anti-abuse factor, 0.0 .. 1.0
  is_provisional boolean not null default false, -- still being computed?
  
  -- Rollback info
  can_rollback_to_id uuid, -- previous snapshot if this one is deemed bad
  rollback_reason text,
  
  constraint snapshots_subject_type_chk check (subject_type in ('hashtag', 'segment_trend', 'user_reputation')),
  constraint snapshots_decision_type_chk check (decision_type in ('trend_score', 'moderation_status', 'user_trust_score', 'anti_abuse_flag')),
  constraint snapshots_confidence_chk check (confidence_score >= 0.0 and confidence_score <= 1.0),
  constraint snapshots_trust_weight_chk check (trust_weight >= 0.0 and trust_weight <= 1.0)
);

create unique index idx_snapshots_subject_version on decision_snapshots (subject_type, subject_id, version_number);
create index idx_snapshots_created_at on decision_snapshots (created_at desc);
create index idx_snapshots_algorithm on decision_snapshots (algorithm_version);

-- ============================================================================
-- 3. ANTI-ABUSE SCORING
-- ============================================================================

create table if not exists anti_abuse_weights (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Policy identity
  policy_id uuid not null unique default gen_random_uuid(),
  policy_name text not null, -- 'default', 'aggressive', 'lenient'
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000'::uuid,
  
  -- Scoring weights (sum should = 1.0)
  weight_velocity_24h float not null default 0.3, -- rapid growth = suspicious
  weight_unique_authors float not null default 0.2, -- if too few = farm
  weight_engagement_uniformity float not null default 0.15, -- all replies same user?
  weight_bot_account_ratio float not null default 0.2, -- % of bot accounts engaging
  weight_ip_concentration float not null default 0.15, -- all from same ASN?
  
  -- Thresholds
  false_positive_tolerance float not null default 0.08, -- 8% wrong decisions acceptable
  confidence_threshold float not null default 0.75, -- min confidence to apply
  
  -- Activation
  is_active boolean not null default true,
  valid_from timestamptz,
  valid_until timestamptz,
  
  -- Metadata
  version_id text not null, -- 'anti-abuse-policy-v1'
  algorithm_changes jsonb default '{}', -- what changed from previous policy
  
  constraint abuse_weights_sum_chk check (
    weight_velocity_24h + weight_unique_authors + weight_engagement_uniformity + 
    weight_bot_account_ratio + weight_ip_concentration = 1.0
  )
);

create index idx_abuse_weights_active on anti_abuse_weights (is_active, created_at desc);

-- ============================================================================
-- 4. DECISION QUEUE (Worker coordination)
-- ============================================================================

create type decision_job_status as enum ('pending', 'processing', 'completed', 'failed', 'deadletter');
create type decision_job_priority as enum ('low', 'normal', 'high', 'critical');

create table if not exists decision_jobs (
  id bigserial primary key,
  job_id uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Job identity
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000'::uuid,
  job_type text not null, -- 'compute_trend_snapshot', 'apply_moderation', 'evaluate_rollback'
  priority decision_job_priority not null default 'normal',
  
  -- What to compute
  subject_type text not null,
  subject_id text not null,
  algorithm_version text not null,
  
  -- Input context (captured at enqueue time for replay)
  execution_context jsonb not null default '{}', -- country, segment, feature_flags
  
  -- Execution
  status decision_job_status not null default 'pending',
  assigned_worker_id text, -- worker hostname/pod
  attempt_count int not null default 0,
  max_attempts int not null default 3,
  
  -- Result
  result_snapshot_id uuid, -- FK to decision_snapshots if successful
  error_message text,
  error_stack jsonb,
  
  -- Determinism
  idempotency_key text unique,
  previous_job_id uuid, -- linked to prior version
  
  constraint jobs_job_type_chk check (job_type in ('compute_trend_snapshot', 'apply_moderation', 'evaluate_rollback', 'bulk_update'))
);

create index idx_jobs_status_priority on decision_jobs (status, priority) where status in ('pending', 'processing');
create index idx_jobs_idempotency on decision_jobs (idempotency_key) where idempotency_key is not null;

-- ============================================================================
-- 5. MODERATION DECISIONS (Audit trail)
-- ============================================================================

create type moderation_decision_type as enum ('normal', 'restricted', 'hidden', 'quarantined');
create type moderation_actor_type as enum ('system', 'human', 'auto_engine');

create table if not exists moderation_decisions (
  id bigserial primary key,
  decision_id uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  
  -- Subject
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000'::uuid,
  subject_type text not null, -- 'hashtag', 'post', 'user'
  subject_id text not null,
  
  -- Decision
  from_status moderation_decision_type not null,
  to_status moderation_decision_type not null,
  
  actor_type moderation_actor_type not null,
  actor_id uuid,
  reason_codes text[] not null, -- ['spam', 'harassment']
  surface_policy text not null, -- 'suppress_for_you', 'hide_from_trending', 'shadow_ban'
  notes text,
  
  -- Link to engine decision
  decision_snapshot_id uuid references decision_snapshots(snapshot_id),
  confidence_score float,
  
  -- Rollback tracking
  can_be_rolled_back boolean not null default true,
  rollback_cooldown_until timestamptz,
  parent_decision_id uuid references moderation_decisions(decision_id), -- chain of decisions
  
  constraint mod_decisions_subject_chk check (subject_type in ('hashtag', 'post', 'user')),
  constraint mod_decisions_actor_chk check (actor_type in ('system', 'human', 'auto_engine'))
);

create index idx_moderation_decisions_subject on moderation_decisions (subject_type, subject_id);
create index idx_moderation_decisions_created_at on moderation_decisions (created_at desc);
create index idx_moderation_decisions_actor on moderation_decisions (actor_type);

-- ============================================================================
-- 6. ROLLBACK POLICY (Hysteresis + cooldown)
-- ============================================================================

create table if not exists rollback_policies (
  id bigserial primary key,
  policy_id uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Identity
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000'::uuid,
  policy_name text not null, -- 'default', 'conservative', 'aggressive'
  
  -- Triggers for auto-rollback
  false_positive_rate_threshold float not null default 0.08, -- if FPR > 8% in 24h
  sample_size_min_for_trigger int not null default 200, -- need at least N samples
  
  -- Hysteresis (prevent oscillation)
  rollback_hysteresis_window_hours int not null default 6, -- don't rollback again for 6h
  confirmation_quorum_ratio float default null, -- if NULL, no quorum needed (auto)
  
  -- Per-segment overrides
  segment_overrides jsonb default '{}', -- { "seg_us": { "fpr_threshold": 0.1 }, ... }
  
  -- Activation
  is_active boolean not null default true,
  version_id text not null
);

-- ============================================================================
-- 7. IDEMPOTENCY REGISTRY
-- ============================================================================

create table if not exists idempotency_register (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  
  idempotency_key text not null unique,
  organization_id uuid not null default '00000000-0000-0000-0000-000000000000'::uuid,
  
  -- What was the result?
  result_status text not null, -- 'success', 'error'
  result_payload jsonb not null, -- full API response to return again
  
  expires_at timestamptz not null default (now() + interval '30 days')
);

create index idx_idempotency_register_expires on idempotency_register (expires_at);

-- ============================================================================
-- 8. CONTENT HASH VERIFICATION (For replay)
-- ============================================================================

create table if not exists snapshot_content_hashes (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  
  snapshot_id uuid not null references decision_snapshots(snapshot_id),
  content_hash text not null,
  
  -- For verification during replay
  algorithm_version text not null,
  source_event_ids uuid[] not null, -- exact events that were hashed
  input_context_hash text not null,
  
  unique(snapshot_id, content_hash)
);

-- ============================================================================
-- 9. BOOTSTRAP: Algorithm versions & configs
-- ============================================================================

create table if not exists algorithm_versions (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  
  algorithm_id text not null,
  version_number text not null, -- 'v1', 'v2', 'v2.1-rc1'
  
  -- Code/logic fingerprint
  code_sha text not null unique,
  
  -- When active
  released_at timestamptz,
  deprecated_at timestamptz,
  
  -- Metadata
  description text,
  change_notes jsonb,
  author_id uuid,
  
  unique(algorithm_id, version_number)
);

-- ============================================================================
-- 10. GRANT PERMISSIONS
-- ============================================================================

-- Service role can read/write all
grant select, insert, update, delete on decision_engine_events to service_role;
grant select, insert, update, delete on decision_snapshots to service_role;
grant select, insert, update, delete on anti_abuse_weights to service_role;
grant select, insert, update, delete on decision_jobs to service_role;
grant select, insert, update, delete on moderation_decisions to service_role;
grant select, insert, update, delete on rollback_policies to service_role;
grant select, insert, update, delete on idempotency_register to service_role;
grant select, insert, update, delete on snapshot_content_hashes to service_role;
grant select, insert, update, delete on algorithm_versions to service_role;

grant usage on schema public to service_role;
grant all privileges on decision_engine_events to service_role;
grant all privileges on decision_snapshots to service_role;
grant all privileges on anti_abuse_weights to service_role;
grant all privileges on decision_jobs to service_role;
grant all privileges on moderation_decisions to service_role;
grant all privileges on rollback_policies to service_role;
grant all privileges on idempotency_register to service_role;
grant all privileges on snapshot_content_hashes to service_role;
grant all privileges on algorithm_versions to service_role;
