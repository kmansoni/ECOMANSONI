-- TURN replay guard partitioning for 1B users
-- Time-based partitioning to handle 100K+ RPS across regions
--
-- Partitioning strategy:
-- - Monthly partitions for turn_replay_guard
-- - Region sharding via user_scope prefix
-- - Automatic cleanup via native partition drop

create table if not exists public.turn_replay_guard (
   user_scope text not null,
   nonce_hash text not null,
   expires_at timestamptz not null,
   created_at timestamptz not null default now(),
   region_hint text not null default 'global',
   primary key (user_scope, nonce_hash, expires_at)
 ) partition by range (expires_at);
-- Enable RLS — anti-replay data must not be accessible publicly
ALTER TABLE public.turn_replay_guard ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.turn_replay_guard FROM anon, authenticated;
-- Service role can manage all entries (for TURN credential service)
CREATE POLICY IF NOT EXISTS "Service can manage turn replay guard"
  ON public.turn_replay_guard FOR ALL TO service_role USING (true);

-- Create monthly partitions for next 12 months
do $$
declare
  v_start date := date_trunc('month', now());
  v_end date;
  v_is_partitioned boolean := false;
begin
  select exists (
    select 1
    from pg_partitioned_table pt
    join pg_class c on c.oid = pt.partrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'turn_replay_guard'
  ) into v_is_partitioned;

  if v_is_partitioned then
    for i in 0..12 loop
      v_end := v_start + interval '1 month';
      execute format($fmt$
        create table if not exists public.turn_replay_guard_%s
        partition of public.turn_replay_guard
        for values from ('%s') to ('%s');
        
        create index if not exists idx_turn_replay_guard_%s_nonce_hash
        on public.turn_replay_guard_%s (nonce_hash);
      $fmt$, 
        to_char(v_start, 'YYYY_MM'),
        v_start,
        v_end,
        to_char(v_start, 'YYYY_MM'),
        to_char(v_start, 'YYYY_MM')
      );
      v_start := v_end;
    end loop;

    execute 'create table if not exists public.turn_replay_guard_default partition of public.turn_replay_guard default';
  else
    create index if not exists idx_turn_replay_guard_nonce_hash
      on public.turn_replay_guard (nonce_hash);
  end if;
end $$;

-- Partition maintenance function
create or replace function public.turn_replay_guard_hit_v2(
  p_user_scope text,
  p_nonce_hash text,
  p_window_ms int default 300000,
  p_region_hint text default 'global'
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
  v_inserted_expires_at timestamptz;
begin
  v_user_scope := left(coalesce(nullif(trim(p_user_scope), ''), 'unknown'), 80);
  v_nonce_hash := left(coalesce(nullif(trim(p_nonce_hash), ''), 'unknown'), 120);
  v_window_ms := coalesce(p_window_ms, 300000);
  if v_window_ms < 1000 then v_window_ms := 1000; end if;
  v_expires_at := v_now + ((v_window_ms::text || ' milliseconds')::interval);

  insert into public.turn_replay_guard(user_scope, nonce_hash, expires_at, region_hint)
  values (v_user_scope, v_nonce_hash, v_expires_at, p_region_hint)
  on conflict do nothing
  returning turn_replay_guard.expires_at into v_inserted_expires_at;

  allowed := found;
  expires_at := coalesce(v_inserted_expires_at, v_expires_at);
  return next;
end;
$$;

revoke all on function public.turn_replay_guard_hit_v2(text, text, int, text) from public;
grant execute on function public.turn_replay_guard_hit_v2(text, text, int, text) to service_role;