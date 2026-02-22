-- 20260224004000_internal_event_dedup_v1.sql
-- REQ-0133: Internal Event HMAC and Replay Protection registry (service_role)

create table if not exists public.internal_event_dedup (
  event_id uuid primary key,
  issued_at_ms bigint not null check (issued_at_ms >= 0),
  expires_at_ms bigint not null check (expires_at_ms >= issued_at_ms),
  seen_at timestamptz not null default now(),
  source text,
  payload_hash text
);

create index if not exists internal_event_dedup_seen_idx
  on public.internal_event_dedup(seen_at desc);

alter table public.internal_event_dedup enable row level security;

-- No direct policies for client roles. Access via service-role RPC only.

create or replace function public.internal_event_register_v1(
  p_event_id uuid,
  p_issued_at_ms bigint,
  p_expires_at_ms bigint,
  p_source text default null,
  p_payload_hash text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int;
  v_now_ms bigint := floor(extract(epoch from now()) * 1000);
begin
  if p_event_id is null then
    raise exception 'invalid_event_id' using errcode = '22023';
  end if;

  if p_issued_at_ms is null or p_expires_at_ms is null then
    raise exception 'invalid_timestamps' using errcode = '22023';
  end if;

  if p_expires_at_ms < p_issued_at_ms then
    raise exception 'invalid_expiry' using errcode = '22023';
  end if;

  -- hard reject expired events
  if p_expires_at_ms < v_now_ms then
    return false;
  end if;

  insert into public.internal_event_dedup(event_id, issued_at_ms, expires_at_ms, source, payload_hash)
  values (p_event_id, p_issued_at_ms, p_expires_at_ms, p_source, p_payload_hash)
  on conflict (event_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

create or replace function public.internal_event_gc_v1(
  p_keep_seconds integer default 604800
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.internal_event_dedup
  where seen_at < now() - make_interval(secs => greatest(coalesce(p_keep_seconds, 604800), 60));

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.internal_event_register_v1(uuid, bigint, bigint, text, text) from public;
revoke all on function public.internal_event_gc_v1(integer) from public;

grant execute on function public.internal_event_register_v1(uuid, bigint, bigint, text, text) to service_role;
grant execute on function public.internal_event_gc_v1(integer) to service_role;
