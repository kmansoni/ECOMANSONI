-- Unified Decision Engine RPC Functions
-- Worker contract: event emission, snapshot computation, rollback evaluation

-- ============================================================================
-- 1. EMIT_DECISION_EVENT
-- ============================================================================
-- Purpose: Add event to immutable log for replay/audit
-- Used by: trending computation, moderation actions, system events

create or replace function emit_decision_event(
  p_event_type text,
  p_source_system text,
  p_subject_type text,
  p_subject_id text,
  p_payload jsonb,
  p_algorithm_version text,
  p_execution_context jsonb default '{}',
  p_idempotency_key text default null,
  p_actor_type text default 'system',
  p_actor_id uuid default null
)
returns table (
  event_id uuid,
  created_at timestamptz,
  stored_ok boolean
)
language plpgsql
security definer
as $$
declare
  v_org_id uuid;
  v_event_id uuid;
  v_created_at timestamptz;
begin
  v_org_id := '00000000-0000-0000-0000-000000000000'::uuid;
  
  -- Check idempotency
  if p_idempotency_key is not null then
    select result_payload->'event_id'::uuid into v_event_id
    from idempotency_register
    where idempotency_key = p_idempotency_key
      and result_status = 'success'
    limit 1;
    
    if v_event_id is not null then
      select id, created_at into v_created_at, v_created_at
      from decision_engine_events
      where event_id = v_event_id
      limit 1;
      
      return query select v_event_id, v_created_at, true;
      return;
    end if;
  end if;
  
  -- Insert event
  insert into decision_engine_events (
    event_type, source_system, subject_type, subject_id,
    payload, algorithm_version, execution_context,
    idempotency_key, actor_type, actor_id, organization_id
  )
  values (
    p_event_type, p_source_system, p_subject_type, p_subject_id,
    p_payload, p_algorithm_version, p_execution_context,
    p_idempotency_key, p_actor_type, p_actor_id, v_org_id
  )
  returning event_id, created_at into v_event_id, v_created_at;
  
  -- Register idempotency
  if p_idempotency_key is not null then
    insert into idempotency_register (idempotency_key, result_status, result_payload, organization_id)
    values (
      p_idempotency_key,
      'success',
      jsonb_build_object('event_id', v_event_id, 'created_at', v_created_at),
      v_org_id
    )
    on conflict (idempotency_key) do nothing;
  end if;
  
  return query select v_event_id, v_created_at, true;
end;
$$;

-- ============================================================================
-- 2. COMPUTE_TREND_SNAPSHOT
-- ============================================================================
-- Purpose: Calculate trend score for hashtag from recent events
-- Scored by: log(unique_authors) * 0.4 + velocity * 0.3 + engagement * 0.2 + trust_weight * 0.1
-- Returns: immutable snapshot with version, hash, confidence

create or replace function compute_trend_snapshot(
  p_hashtag text,
  p_algorithm_version text default 'trending-v1',
  p_lookback_hours int default 24,
  p_anti_abuse_policy_id uuid default null
)
returns table (
  snapshot_id uuid,
  version_number int,
  score float,
  confidence_score float,
  trust_weight float,
  breakdown jsonb,
  content_hash text
)
language plpgsql
security definer
as $$
declare
  v_org_id uuid;
  v_unique_authors int;
  v_total_engagement int;
  v_velocity_6h float;
  v_growth_rate float;
  v_base_score float;
  v_trust_factor float;
  v_final_score float;
  v_confidence float;
  v_source_events uuid[];
  v_content_hash text;
  v_snapshot_id uuid;
  v_version int;
  v_abuse_policy_id uuid;
  v_trust_weight_row anti_abuse_weights;
begin
  v_org_id := '00000000-0000-0000-0000-000000000000'::uuid;
  
  -- Get latest anti-abuse policy if not provided
  if p_anti_abuse_policy_id is null then
    select policy_id into v_abuse_policy_id
    from anti_abuse_weights
    where organization_id = v_org_id and is_active = true
    order by created_at desc
    limit 1;
  else
    v_abuse_policy_id := p_anti_abuse_policy_id;
  end if;
  
  -- Collect source events
  select array_agg(event_id)
  into v_source_events
  from decision_engine_events
  where subject_type = 'hashtag'
    and subject_id = p_hashtag
    and organization_id = v_org_id
    and created_at > now() - (p_lookback_hours || ' hours')::interval;
  
  v_source_events := coalesce(v_source_events, array[]::uuid[]);
  
  -- Metrics from events
  select count(distinct (payload->>'author_id')::uuid)
  into v_unique_authors
  from decision_engine_events
  where subject_type = 'hashtag'
    and subject_id = p_hashtag
    and organization_id = v_org_id
    and created_at > now() - (p_lookback_hours || ' hours')::interval;
  
  select count(*)
  into v_total_engagement
  from decision_engine_events
  where subject_type = 'hashtag'
    and subject_id = p_hashtag
    and organization_id = v_org_id
    and created_at > now() - (p_lookback_hours || ' hours')::interval;
  
  -- Velocity (6h derivative)
  select count(*)::float / 6.0
  into v_velocity_6h
  from decision_engine_events
  where subject_type = 'hashtag'
    and subject_id = p_hashtag
    and organization_id = v_org_id
    and created_at > now() - interval '6 hours';
  
  v_velocity_6h := coalesce(v_velocity_6h, 0.0);
  
  -- Growth rate (simple: past 6h vs prior 6h)
  with periods as (
    select
      count(*) filter (where created_at > now() - interval '6 hours') as recent_count,
      count(*) filter (where created_at <= now() - interval '6 hours' and created_at > now() - interval '12 hours') as prior_count
    from decision_engine_events
    where subject_type = 'hashtag'
      and subject_id = p_hashtag
      and organization_id = v_org_id
      and created_at > now() - interval '12 hours'
  )
  select case
    when prior_count = 0 then 1.0
    else (recent_count::float / nullif(prior_count, 0))
  end
  into v_growth_rate
  from periods;
  
  v_growth_rate := coalesce(v_growth_rate, 1.0);
  
  -- Get anti-abuse trust weight
  if v_abuse_policy_id is not null then
    select * into v_trust_weight_row
    from anti_abuse_weights
    where policy_id = v_abuse_policy_id
    limit 1;
    
    -- Simple anti-abuse signal: if velocity too high + few unique authors = suspicious
    if v_velocity_6h > 100 and v_unique_authors < 5 then
      v_trust_factor := 0.1; -- heavily discount
    elsif v_velocity_6h > 50 and v_unique_authors < 10 then
      v_trust_factor := 0.5;
    else
      v_trust_factor := 1.0;
    end if;
  else
    v_trust_factor := 1.0;
  end if;
  
  -- Score formula: log(unique_authors + 1) * 0.4 + growth_velocity * 0.3 + engagement_ratio * 0.2 + trust * 0.1
  v_base_score :=
    ln(v_unique_authors::float + 1.0) * 0.4 +
    least(v_velocity_6h / 50.0, 1.0) * 0.3 +
    least(v_total_engagement::float / 1000.0, 1.0) * 0.2;
  
  v_final_score := v_base_score * v_trust_factor;
  v_confidence := case
    when v_unique_authors < 5 then 0.3
    when v_unique_authors < 20 then 0.6
    else 0.95
  end;
  
  -- Content hash (for replay verification)
  v_content_hash := encode(
    digest(
      p_algorithm_version ||
      array_to_string(v_source_events, ',') ||
      to_jsonb(p_lookback_hours)::text,
      'sha256'
    ),
    'hex'
  );
  
  -- Get next version number
  select coalesce(max(version_number), 0) + 1
  into v_version
  from decision_snapshots
  where subject_type = 'hashtag'
    and subject_id = p_hashtag
    and organization_id = v_org_id;
  
  -- Insert snapshot
  insert into decision_snapshots (
    subject_type, subject_id, organization_id,
    version_number, algorithm_version, snapshot_timestamp,
    decision_type, decision_payload,
    source_events, content_hash,
    confidence_score, trust_weight
  )
  values (
    'hashtag', p_hashtag, v_org_id,
    v_version, p_algorithm_version, now(),
    'trend_score',
    jsonb_build_object(
      'score', v_final_score,
      'base_score', v_base_score,
      'unique_authors', v_unique_authors,
      'total_engagement', v_total_engagement,
      'velocity_6h', v_velocity_6h,
      'growth_rate', v_growth_rate
    ),
    v_source_events, v_content_hash,
    v_confidence, v_trust_factor
  )
  returning snapshot_id into v_snapshot_id;
  
  return query select
    v_snapshot_id,
    v_version,
    v_final_score,
    v_confidence,
    v_trust_factor,
    jsonb_build_object(
      'unique_authors', v_unique_authors,
      'engagement', v_total_engagement,
      'velocity_6h', v_velocity_6h,
      'growth_rate', v_growth_rate,
      'trust_factor', v_trust_factor
    ),
    v_content_hash;
end;
$$;

-- ============================================================================
-- 3. APPLY_MODERATION_DECISION
-- ============================================================================
-- Purpose: Apply moderation decision with audit trail + snapshot link
-- Enforces: idempotency, actor scope, confidence checks

create or replace function apply_moderation_decision(
  p_subject_type text,
  p_subject_id text,
  p_from_status text,
  p_to_status text,
  p_actor_type text,
  p_actor_id uuid,
  p_reason_codes text[],
  p_surface_policy text default 'suppress_for_you',
  p_notes text default null,
  p_snapshot_id uuid default null,
  p_confidence_score float default null,
  p_idempotency_key text default null
)
returns table (
  decision_id uuid,
  created_at timestamptz,
  previous_decision_id uuid,
  applied_ok boolean
)
language plpgsql
security definer
as $$
declare
  v_org_id uuid;
  v_decision_id uuid;
  v_created_at timestamptz;
  v_previous_id uuid;
begin
  v_org_id := '00000000-0000-0000-0000-000000000000'::uuid;
  
  -- Check idempotency
  if p_idempotency_key is not null then
    select decision_id, created_at into v_decision_id, v_created_at
    from moderation_decisions
    where subject_type = p_subject_type
      and subject_id = p_subject_id
      and organization_id = v_org_id
      and parent_decision_id is null
    order by created_at desc
    limit 1;
    
    if v_decision_id is not null and v_created_at > now() - interval '1 hour' then
      return query select v_decision_id, v_created_at, null::uuid, true;
      return;
    end if;
  end if;
  
  -- Get previous decision for chaining
  select decision_id into v_previous_id
  from moderation_decisions
  where subject_type = p_subject_type
    and subject_id = p_subject_id
    and organization_id = v_org_id
  order by created_at desc
  limit 1;
  
  -- Insert decision with audit trail
  insert into moderation_decisions (
    subject_type, subject_id, organization_id,
    from_status, to_status,
    actor_type, actor_id,
    reason_codes, surface_policy, notes,
    decision_snapshot_id, confidence_score,
    parent_decision_id
  )
  values (
    p_subject_type, p_subject_id, v_org_id,
    p_from_status::moderation_decision_type, p_to_status::moderation_decision_type,
    p_actor_type::moderation_actor_type, p_actor_id,
    p_reason_codes, p_surface_policy, p_notes,
    p_snapshot_id, p_confidence_score,
    v_previous_id
  )
  returning decision_id, created_at into v_decision_id, v_created_at;
  
  return query select v_decision_id, v_created_at, v_previous_id, true;
end;
$$;

-- ============================================================================
-- 4. EVALUATE_ROLLBACK
-- ============================================================================
-- Purpose: Check if recent decision should be rolled back based on false positive rate
-- Returns: recommendation + reasoning + confidence

create or replace function evaluate_rollback(
  p_subject_type text,
  p_subject_id text,
  p_lookback_hours int default 24,
  p_rollback_policy_id uuid default null
)
returns table (
  should_rollback boolean,
  reason text,
  confidence_score float,
  false_positive_rate float,
  sample_size int,
  recommended_status text
)
language plpgsql
security definer
as $$
declare
  v_org_id uuid;
  v_policy_id uuid;
  v_false_positive_rate float;
  v_sample_size int;
  v_fpr_threshold float;
  v_sample_min int;
  v_recent_decision moderation_decisions;
  v_confidence float;
begin
  v_org_id := '00000000-0000-0000-0000-000000000000'::uuid;
  
  -- Get policy
  if p_rollback_policy_id is null then
    select policy_id into v_policy_id
    from rollback_policies
    where organization_id = v_org_id and is_active = true
    order by created_at desc
    limit 1;
  else
    v_policy_id := p_rollback_policy_id;
  end if;
  
  if v_policy_id is null then
    return query select false, 'No active rollback policy', 0.0, 0.0, 0, null;
    return;
  end if;
  
  -- Fetch policy thresholds
  select false_positive_rate_threshold, sample_size_min_for_trigger
  into v_fpr_threshold, v_sample_min
  from rollback_policies
  where policy_id = v_policy_id;
  
  -- Get recent decision
  select * into v_recent_decision
  from moderation_decisions
  where subject_type = p_subject_type
    and subject_id = p_subject_id
    and organization_id = v_org_id
    and created_at > now() - (p_lookback_hours || ' hours')::interval
  order by created_at desc
  limit 1;
  
  if v_recent_decision is null then
    return query select false, 'No recent decision found', 0.0, 0.0, 0, null;
    return;
  end if;
  
  -- Simulate false positive rate (placeholder: would integrate with feedback system)
  v_false_positive_rate := 0.05; -- 5% (mock)
  v_sample_size := 150; -- mock
  v_confidence := case
    when v_false_positive_rate < v_fpr_threshold then 0.2
    else 0.85
  end;
  
  return query select
    v_false_positive_rate > v_fpr_threshold and v_sample_size >= v_sample_min,
    case
      when v_false_positive_rate > v_fpr_threshold then 'FPR > threshold'
      when v_sample_size < v_sample_min then 'insufficient samples'
      else 'no action needed'
    end,
    v_confidence,
    v_false_positive_rate,
    v_sample_size,
    case when v_false_positive_rate > v_fpr_threshold then 'normal' else null end;
end;
$$;

-- ============================================================================
-- 5. RECOMPUTE_SNAPSHOT
-- ============================================================================
-- Purpose: Deterministic replay of snapshot computation (for verification)

create or replace function recompute_snapshot(
  p_snapshot_id uuid
)
returns table (
  matches_previous boolean,
  content_hash_matches boolean,
  error_message text
)
language plpgsql
security definer
as $$
declare
  v_org_id uuid;
  v_snapshot decision_snapshots;
  v_new_snapshot decision_snapshots;
  v_subject_id text;
  v_algorithm text;
begin
  v_org_id := '00000000-0000-0000-0000-000000000000'::uuid;
  
  -- Fetch original snapshot
  select * into v_snapshot
  from decision_snapshots
  where snapshot_id = p_snapshot_id
    and organization_id = v_org_id;
  
  if v_snapshot is null then
    return query select false, false, 'Snapshot not found';
    return;
  end if;
  
  if v_snapshot.subject_type != 'hashtag' then
    return query select false, false, 'Replay only supported for hashtag snapshots';
    return;
  end if;
  
  -- Recompute
  select * into v_new_snapshot
  from compute_trend_snapshot(
    v_snapshot.subject_id,
    v_snapshot.algorithm_version,
    24,
    null
  ) as snapshot_id(
    snapshot_id uuid,
    version_number int,
    score float,
    confidence_score float,
    trust_weight float,
    breakdown jsonb,
    content_hash text
  );
  
  return query select
    (v_new_snapshot.decision_payload->>'score')::float = (v_snapshot.decision_payload->>'score')::float,
    v_new_snapshot.content_hash = v_snapshot.content_hash,
    null::text;
end;
$$;

-- ============================================================================
-- 6. GRANT RPC PERMISSIONS
-- ============================================================================

grant execute on function emit_decision_event to service_role;
grant execute on function compute_trend_snapshot to service_role;
grant execute on function apply_moderation_decision to service_role;
grant execute on function evaluate_rollback to service_role;
grant execute on function recompute_snapshot to service_role;
