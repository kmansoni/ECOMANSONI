-- 20260224154000_req_0140_call_signaling_state_machine.sql
-- REQ-0140: Call Signaling State Machine and Race Safety (P0)

-- Table: calls (migrate from old schema)
-- Rename status → state for consistency with REQ-0140
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'calls'
      AND column_name = 'status'
  ) THEN
    ALTER TABLE public.calls RENAME COLUMN status TO state;
  END IF;
END $$;

-- Add missing columns for REQ-0140
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signaling_data JSONB,
  ADD COLUMN IF NOT EXISTS end_reason TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Set default expires_at for existing calls
UPDATE public.calls
SET expires_at = created_at + interval '1 minute'
WHERE expires_at IS NULL;

-- Make expires_at NOT NULL after backfill
ALTER TABLE public.calls
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '1 minute'),
  ALTER COLUMN expires_at SET NOT NULL;

-- Update state constraint to include all valid states
DO $$
BEGIN
  ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_state_check;
  ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_status_check;
  ALTER TABLE public.calls
    ADD CONSTRAINT calls_state_check
    CHECK (state IN ('ringing', 'calling', 'active', 'declined', 'cancelled', 'ended', 'missed'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Index for active calls
CREATE INDEX IF NOT EXISTS calls_state_idx
  ON public.calls(state, created_at DESC);

-- Index for user call history
create index if not exists calls_caller_idx
  on public.calls(caller_id, created_at desc);

create index if not exists calls_callee_idx
  on public.calls(callee_id, created_at desc);

-- Index for timeout processing
create index if not exists calls_expires_at_idx
  on public.calls(state, expires_at) where state = 'ringing';

alter table public.calls enable row level security;

-- RLS: users can see calls they're involved in
create policy calls_select on public.calls
  for select using (
    caller_id = auth.uid() or callee_id = auth.uid()
  );

-- Trigger: updated_at
create or replace function public.set_calls_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_calls_updated_at on public.calls;
create trigger trg_calls_updated_at
before update on public.calls
for each row
execute function public.set_calls_updated_at();

-- Helper: publish call event to outbox
create or replace function public.publish_call_event(
  p_call_id uuid,
  p_event_type text,
  p_payload jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.delivery_outbox (topic, aggregate_id, event_type, payload)
  values ('call', p_call_id, p_event_type, p_payload);
$$;

-- RPC: call_create_v1
-- Initiates call, checks busy state, returns call_id
create or replace function public.call_create_v1(
  p_callee_id uuid,
  p_call_type text,
  p_signaling_data jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_call_id uuid;
  v_caller_id uuid := auth.uid();
  v_busy boolean;
begin
  if p_callee_id is null or p_callee_id = v_caller_id then
    raise exception 'invalid_callee' using errcode = '22023';
  end if;

  if p_call_type not in ('voice', 'video') then
    raise exception 'invalid_call_type' using errcode = '22023';
  end if;

  -- Busy detection: callee has active/ringing calls
  select exists(
    select 1 from public.calls
    where (caller_id = p_callee_id or callee_id = p_callee_id)
      and state in ('ringing', 'active')
  ) into v_busy;

  if v_busy then
    raise exception 'callee_busy' using errcode = '42501';
  end if;

  -- Create call
  insert into public.calls (caller_id, callee_id, call_type, signaling_data)
  values (v_caller_id, p_callee_id, p_call_type, p_signaling_data)
  returning id into v_call_id;

  -- Publish event
  perform public.publish_call_event(
    v_call_id,
    'call.created',
    jsonb_build_object(
      'call_id', v_call_id,
      'caller_id', v_caller_id,
      'callee_id', p_callee_id,
      'call_type', p_call_type
    )
  );

  return v_call_id;
end;
$$;

-- RPC: call_accept_v1
-- Accepts ringing call, transitions to active
create or replace function public.call_accept_v1(
  p_call_id uuid,
  p_signaling_data jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_callee_id uuid := auth.uid();
  v_state text;
  v_expires_at timestamptz;
begin
  -- Atomic state transition with lock
  select state, expires_at into v_state, v_expires_at
  from public.calls
  where id = p_call_id and callee_id = v_callee_id
  for update;

  if not found then
    raise exception 'call_not_found_or_forbidden' using errcode = '42P01';
  end if;

  -- Guard: can only accept ringing calls
  if v_state != 'ringing' then
    raise exception 'invalid_state_transition' using errcode = '42501';
  end if;

  -- Guard: cannot accept expired call
  if v_expires_at < now() then
    raise exception 'call_expired' using errcode = '42501';
  end if;

  -- Transition to active
  update public.calls
  set state = 'active',
      answered_at = now(),
      signaling_data = coalesce(p_signaling_data, signaling_data)
  where id = p_call_id;

  -- Publish event
  perform public.publish_call_event(
    p_call_id,
    'call.accepted',
    jsonb_build_object('call_id', p_call_id, 'accepted_at', now())
  );

  return jsonb_build_object('state', 'active', 'accepted_at', now());
end;
$$;

-- RPC: call_decline_v1
-- Declines ringing call
create or replace function public.call_decline_v1(
  p_call_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_callee_id uuid := auth.uid();
  v_state text;
begin
  select state into v_state
  from public.calls
  where id = p_call_id and callee_id = v_callee_id
  for update;

  if not found then
    raise exception 'call_not_found_or_forbidden' using errcode = '42P01';
  end if;

  if v_state != 'ringing' then
    raise exception 'invalid_state_transition' using errcode = '42501';
  end if;

  update public.calls
  set state = 'declined',
      ended_at = now(),
      end_reason = 'declined_by_callee'
  where id = p_call_id;

  perform public.publish_call_event(
    p_call_id,
    'call.declined',
    jsonb_build_object('call_id', p_call_id, 'declined_at', now())
  );

  return jsonb_build_object('state', 'declined', 'declined_at', now());
end;
$$;

-- RPC: call_cancel_v1
-- Cancels ringing call (caller only)
create or replace function public.call_cancel_v1(
  p_call_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_state text;
begin
  select state into v_state
  from public.calls
  where id = p_call_id and caller_id = v_caller_id
  for update;

  if not found then
    raise exception 'call_not_found_or_forbidden' using errcode = '42P01';
  end if;

  if v_state != 'ringing' then
    raise exception 'invalid_state_transition' using errcode = '42501';
  end if;

  update public.calls
  set state = 'cancelled',
      ended_at = now(),
      end_reason = 'cancelled_by_caller'
  where id = p_call_id;

  perform public.publish_call_event(
    p_call_id,
    'call.cancelled',
    jsonb_build_object('call_id', p_call_id, 'cancelled_at', now())
  );

  return jsonb_build_object('state', 'cancelled', 'cancelled_at', now());
end;
$$;

-- RPC: call_end_v1
-- Ends active call (either party)
create or replace function public.call_end_v1(
  p_call_id uuid,
  p_end_reason text default 'ended_by_user'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_state text;
begin
  select state into v_state
  from public.calls
  where id = p_call_id
    and (caller_id = v_user_id or callee_id = v_user_id)
  for update;

  if not found then
    raise exception 'call_not_found_or_forbidden' using errcode = '42P01';
  end if;

  if v_state != 'active' then
    raise exception 'invalid_state_transition' using errcode = '42501';
  end if;

  update public.calls
  set state = 'ended',
      ended_at = now(),
      end_reason = p_end_reason
  where id = p_call_id;

  perform public.publish_call_event(
    p_call_id,
    'call.ended',
    jsonb_build_object(
      'call_id', p_call_id,
      'ended_at', now(),
      'end_reason', p_end_reason
    )
  );

  return jsonb_build_object('state', 'ended', 'ended_at', now());
end;
$$;

-- RPC: call_process_timeouts_v1
-- Background job: marks expired ringing calls as missed
create or replace function public.call_process_timeouts_v1()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with expired as (
    select id
    from public.calls
    where state = 'ringing'
      and expires_at < now()
    for update skip locked
  )
  update public.calls c
  set state = 'missed',
      ended_at = now(),
      end_reason = 'timeout'
  from expired e
  where c.id = e.id;

  get diagnostics v_count = row_count;

  -- Publish events for missed calls
  insert into public.delivery_outbox (topic, aggregate_id, event_type, payload)
  select 'call', id, 'call.missed', jsonb_build_object('call_id', id, 'missed_at', now())
  from public.calls
  where state = 'missed' and ended_at >= now() - interval '5 seconds';

  return v_count;
end;
$$;

-- Grant execute to authenticated users
grant execute on function public.call_create_v1(uuid, text, jsonb) to authenticated;
grant execute on function public.call_accept_v1(uuid, jsonb) to authenticated;
grant execute on function public.call_decline_v1(uuid) to authenticated;
grant execute on function public.call_cancel_v1(uuid) to authenticated;
grant execute on function public.call_end_v1(uuid, text) to authenticated;

-- Grant timeout processor to service_role only
revoke all on function public.call_process_timeouts_v1() from public;
grant execute on function public.call_process_timeouts_v1() to service_role;
