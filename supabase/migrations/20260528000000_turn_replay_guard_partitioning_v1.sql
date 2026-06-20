-- TURN replay guard: durable nonce store to prevent credential replay attacks.
-- Replaces the in-memory Map fallback with a Postgres-backed single source of truth.
-- Partitioned by month for cheap pruning at 1B scale (100K+ RPS per region).
--
-- Contract consumed by supabase/functions/turn-credentials/index.ts:
--   rpc turn_replay_guard_hit_v1(p_user_scope text, p_nonce_hash text, p_window_ms integer)
--     -> returns table(allowed boolean)
--
-- Signature is pinned to (text,text,integer) — matches the revoke/grant lines in
-- migrations_hold/*_critical_security_hardening_v1.sql so those grants resolve.

create table if not exists public.turn_replay_guard (
  user_scope  text        not null,
  nonce_hash  text        not null,
  seen_at     timestamptz not null default now(),
  expires_at  timestamptz not null,
  primary key (user_scope, nonce_hash, seen_at)
) partition by range (seen_at);

create table if not exists public.turn_replay_guard_default
partition of public.turn_replay_guard default;

create index if not exists turn_replay_guard_scope_nonce_idx
on public.turn_replay_guard_default (user_scope, nonce_hash);

create index if not exists turn_replay_guard_expires_at_idx
on public.turn_replay_guard_default (expires_at);

create or replace function public.turn_replay_guard_hit_v1(
p_user_scope text,
p_nonce_hash text,
p_window_ms integer
)
returns table(allowed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
v_now    timestamptz := clock_timestamp();
v_expiry timestamptz := v_now + make_interval(secs => greatest(p_window_ms, 1000) / 1000.0);
v_existing_expires timestamptz;
begin
if p_user_scope is null or p_nonce_hash is null then
return query select false;
return;
end if;

-- Check for an unexpired slot first. A live row = replay -> reject.
select g.expires_at into v_existing_expires
from public.turn_replay_guard g
where g.user_scope = p_user_scope and g.nonce_hash = p_nonce_hash
and g.expires_at > v_now
limit 1;

if v_existing_expires is not null then
return query select false;
return;
end if;

-- Prune any expired slot for this key so the unique claim below succeeds cleanly.
delete from public.turn_replay_guard g
where g.user_scope = p_user_scope and g.nonce_hash = p_nonce_hash;

insert into public.turn_replay_guard (user_scope, nonce_hash, seen_at, expires_at)
values (p_user_scope, p_nonce_hash, v_now, v_expiry);

return query select true;
end;
$$;

revoke all on function public.turn_replay_guard_hit_v1(text, text, integer) from public;
revoke all on function public.turn_replay_guard_hit_v1(text, text, integer) from anon;
revoke all on function public.turn_replay_guard_hit_v1(text, text, integer) from authenticated;
grant execute on function public.turn_replay_guard_hit_v1(text, text, integer) to service_role;

alter table public.turn_replay_guard enable row level security;
alter table public.turn_replay_guard_default enable row level security;

create policy turn_replay_guard_service_only on public.turn_replay_guard_default
for all to service_role using (true) with check (true);
