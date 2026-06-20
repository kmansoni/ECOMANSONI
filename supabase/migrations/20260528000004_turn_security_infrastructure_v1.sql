-- TURN issuance rate-limit store + audit log.
-- Backs the durable rate-limit and audit paths in
-- supabase/functions/turn-credentials/index.ts:
--   rpc turn_issuance_rl_hit_v1(p_user_id uuid, p_ip text, p_max integer)
--     -> returns table(allowed boolean)
--   table turn_issuance_rl  (must NOT be readable by authenticated — Gate 3)
--   table turn_issuance_audit (insert-only via service_role)

-- Per-user + per-IP sliding-minute counter. One row per (user, bucket).
create table if not exists public.turn_issuance_rl (
  user_id    uuid        not null,
  ip_scope   text        not null,
  bucket_ts  timestamptz not null,
  cnt        integer     not null default 1,
  primary key (user_id, ip_scope, bucket_ts)
);

create index if not exists turn_issuance_rl_bucket_ts_idx
  on public.turn_issuance_rl (bucket_ts);

create or replace function public.turn_issuance_rl_hit_v1(
  p_user_id uuid,
  p_ip      text,
  p_max     integer
)
returns table(allowed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bucket timestamptz := date_trunc('minute', now());
  v_new_cnt integer;
begin
  if p_user_id is null or p_max is null or p_max < 1 then
    return query select false;
    return;
  end if;

  -- upsert the current-minute bucket and capture the resulting count.
  insert into public.turn_issuance_rl (user_id, ip_scope, bucket_ts, cnt)
  values (p_user_id, coalesce(p_ip, ''), v_bucket, 1)
  on conflict (user_id, ip_scope, bucket_ts) do update
    set cnt = public.turn_issuance_rl.cnt + 1
  returning cnt into v_new_cnt;

  return query select coalesce(v_new_cnt, 0) <= p_max;
end;
$$;

revoke all on function public.turn_issuance_rl_hit_v1(uuid, text, integer) from public;
revoke all on function public.turn_issuance_rl_hit_v1(uuid, text, integer) from anon;
revoke all on function public.turn_issuance_rl_hit_v1(uuid, text, integer) from authenticated;
grant execute on function public.turn_issuance_rl_hit_v1(uuid, text, integer) to service_role;

alter table public.turn_issuance_rl enable row level security;

-- No policy for anon/authenticated -> fail-closed. Only service_role bypasses RLS.
create policy turn_issuance_rl_service_only on public.turn_issuance_rl
for all to service_role using (true) with check (true);

-- Audit trail for every credential issuance attempt. Columns match writeAuditLog()
-- in the edge function. Insert-only; service_role writes.
create table if not exists public.turn_issuance_audit (
id          bigint generated always as identity primary key,
request_id    text        not null,
auth_type     text        not null,
user_hash     text        not null,
ip_hash       text        not null default '',
outcome       text        not null,
status_code   integer     not null default 0,
latency_ms    integer     not null default 0,
ttl_seconds   integer     not null default 0,
error_code    text,
region_hint   text        not null default 'global',
created_at    timestamptz not null default now()
);

create index if not exists turn_issuance_audit_created_at_idx
on public.turn_issuance_audit (created_at);

create index if not exists turn_issuance_audit_outcome_idx
on public.turn_issuance_audit (outcome);

alter table public.turn_issuance_audit enable row level security;

create policy turn_issuance_audit_service_only on public.turn_issuance_audit
for all to service_role using (true) with check (true);
