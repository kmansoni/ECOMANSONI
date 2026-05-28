-- TURN concurrent allocation tracking for load balancing
-- Tracks live allocations per region to prevent overload
--
-- Triggers:
-- - Increment on credential issuance
-- - Decrement on expiry cleanup
-- - Used by load balancer to route users away from hot regions

create table if not exists public.turn_active_allocations (
  region public.turn_region_t not null,
  user_id uuid,
  ip_hash text not null, -- anonymized IP
  allocated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  session_id text, -- optional SFU session correlation
  primary key (region, ip_hash, allocated_at)
) partition by range (allocated_at);

-- Monthly partitions
do $$
declare
  v_start date := date_trunc('month', now());
  v_end date;
begin
  for i in 0..12 loop
    v_end := v_start + interval '1 month';
    execute format($fmt$
      create table if not exists public.turn_active_allocations_%s
      partition of public.turn_active_allocations
      for values from ('%s') to ('%s');
    $fmt$, 
      to_char(v_start, 'YYYY_MM'),
      v_start,
      v_end
    );
    v_start := v_end;
  end loop;
end $$;

create table if not exists public.turn_active_allocations_default
partition of public.turn_active_allocations default;

-- Function: track allocation
create or replace function public.track_turn_allocation(
  p_region public.turn_region_t,
  p_user_id uuid,
  p_ip_hash text,
  p_expires_at timestamptz,
  p_session_id text default null
)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.turn_active_allocations(region, user_id, ip_hash, expires_at, session_id)
  values (p_region, p_user_id, p_ip_hash, p_expires_at, p_session_id)
  on conflict do nothing;
end;
$$;

-- Function: get region load
create or replace function public.get_turn_region_load(
  p_region public.turn_region_t default null
)
returns table (
  region public.turn_region_t,
  active_count bigint,
  capacity_limit int,
  utilization_pct float
)
language plpgsql
security definer
as $$
begin
  return query
  select 
    coalesce(r.region, 'all') as region,
    count(a.ip_hash)::bigint as active_count,
    r.max_concurrent as capacity_limit,
    round(count(a.ip_hash)::float / r.max_concurrent * 100, 2) as utilization_pct
  from public.turn_regions r
  left join public.turn_active_allocations a 
    on a.region = r.region and a.expires_at > now()
  where (p_region is null or r.region = p_region) and r.active
  group by r.region, r.max_concurrent;
end;
$$;

-- Cleanup function (run via pg_cron every minute)
create or replace function public.cleanup_expired_turn_allocations()
returns integer
language plpgsql
security definer
as $$
declare
  v_deleted int;
begin
  delete from public.turn_active_allocations 
  where expires_at < now() - interval '5 minutes';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Enable RLS
alter table public.turn_active_allocations enable row level security;
create policy turn_allocations_service on public.turn_active_allocations
  for all to service_role using (true);

-- Grant permissions
grant execute on function public.track_turn_allocation to service_role;
grant execute on function public.get_turn_region_load to service_role;
grant execute on function public.cleanup_expired_turn_allocations to service_role;