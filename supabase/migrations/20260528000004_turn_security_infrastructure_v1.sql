-- TURN issuance rate-limit store + audit log + replay guard.
-- Backs the durable rate-limit, replay-protection and audit paths in
-- supabase/functions/turn-credentials/index.ts:
--   rpc turn_issuance_rl_hit_v1(p_user_id uuid, p_ip text, p_max integer)
--     -> returns table(allowed boolean)
--   rpc turn_replay_guard_hit_v1(p_user_scope text, p_nonce_hash text, p_window_ms integer)
--     -> returns table(allowed boolean)
--   table turn_issuance_rl  (must NOT be readable by authenticated — Gate 3)
--   table turn_issuance_audit (insert-only via service_role)

-- Nonce replay guard: one row per (user_scope, nonce_hash) with TTL.
-- Primary defence vs replay attacks on TURN credentials.
create table if not exists public.turn_replay_nonces (
  nonce_hash text        not null,
  user_scope  text        not null,
  expires_at timestamptz not null,
  primary key (nonce_hash, user_scope)
);

create index if not exists turn_replay_nonces_expires_at_idx
  on public.turn_replay_nonces (expires_at);

create or replace function public.turn_replay_guard_hit_v1(
  p_user_scope  text,
  p_nonce_hash  text,
  p_window_ms   integer
)
returns table(allowed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expires_at timestamptz := now() + (p_window_ms || ' milliseconds')::interval;
begin
  if p_nonce_hash is null or p_user_scope is null then
    return query select true;
    return;
  end if;

  insert into public.turn_replay_nonces (nonce_hash, user_scope, expires_at)
  values (p_nonce_hash, p_user_scope, v_expires_at)
  on conflict (nonce_hash, user_scope) do nothing;

  -- If the insert was a no-op (key already existed), the nonce was replayed.
  -- Confirm by re-checking — if row now exists with this nonce_hash + user_scope, it was new.
  if exists (
    select 1 from public.turn_replay_nonces
    where nonce_hash = p_nonce_hash and user_scope = p_user_scope
    limit 1
  ) then
    -- Could be new or old — check by expires_at: new rows have v_expires_at exactly
    if exists (
      select 1 from public.turn_replay_nonces
      where nonce_hash = p_nonce_hash
        and user_scope = p_user_scope
        and expires_at = v_expires_at
    ) then
      return query select true;  -- allowed: fresh nonce
    else
      return query select false;  -- rejected: replay
    end if;
  else
    return query select false;
  end if;
end;
$$;

revoke all on function public.turn_replay_guard_hit_v1(text, text, integer) from public;
revoke all on function public.turn_replay_guard_hit_v1(text, text, integer) from anon;
revoke all on function public.turn_replay_guard_hit_v1(text, text, integer) from authenticated;
grant execute on function public.turn_replay_guard_hit_v1(text, text, integer) to service_role;

alter table public.turn_replay_nonces enable row level security;

create policy turn_replay_nonces_service_only on public.turn_replay_nonces
for all to service_role using (true) with check (true);

-- Periodic cleanup of expired nonces (runs every 5 minutes via pg_cron or external scheduler)
-- For now: manual cleanup via: delete from turn_replay_nonces where expires_at < now();

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
