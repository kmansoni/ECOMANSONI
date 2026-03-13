-- Durable replay guard for TURN credential issuance.
--
-- Why:
-- In-memory nonce maps in serverless functions are not globally consistent.
-- This table + RPC enforces nonce uniqueness across all function instances.

create table if not exists public.turn_replay_guard (
  user_scope text not null,
  nonce_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_scope, nonce_hash)
);

create index if not exists idx_turn_replay_guard_expires_at
  on public.turn_replay_guard (expires_at);

alter table public.turn_replay_guard enable row level security;

revoke all on table public.turn_replay_guard from public;
revoke all on table public.turn_replay_guard from anon;
revoke all on table public.turn_replay_guard from authenticated;

create or replace function public.turn_replay_guard_hit_v1(
  p_user_scope text,
  p_nonce_hash text,
  p_window_ms int default 300000
)
returns table (
  allowed boolean,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_scope text;
  v_nonce_hash text;
  v_window_ms int;
  v_now timestamptz := now();
  v_expires_at timestamptz;
begin
  v_user_scope := left(coalesce(nullif(trim(p_user_scope), ''), 'unknown'), 80);
  v_nonce_hash := left(coalesce(nullif(trim(p_nonce_hash), ''), 'unknown'), 120);

  if v_user_scope = 'unknown' or v_nonce_hash = 'unknown' then
    raise exception 'p_user_scope and p_nonce_hash are required';
  end if;

  v_window_ms := coalesce(p_window_ms, 300000);
  if v_window_ms < 1000 then v_window_ms := 1000; end if;
  v_expires_at := v_now + ((v_window_ms::text || ' milliseconds')::interval);

  delete from public.turn_replay_guard
  where user_scope = v_user_scope
    and expires_at < v_now;

  insert into public.turn_replay_guard(user_scope, nonce_hash, expires_at)
  values (v_user_scope, v_nonce_hash, v_expires_at)
  on conflict on constraint turn_replay_guard_pkey do nothing;

  if found then
    allowed := true;
  else
    allowed := false;
  end if;

  expires_at := v_expires_at;
  return next;
end;
$$;

revoke all on function public.turn_replay_guard_hit_v1(text, text, int) from public;
grant execute on function public.turn_replay_guard_hit_v1(text, text, int) to service_role;
