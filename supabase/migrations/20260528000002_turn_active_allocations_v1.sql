-- TURN active allocation tracking for load balancing across regions.
-- Provides the functions referenced by 20260528000003_turn_cleanup_cron_v1.sql:
--   public.cleanup_expired_turn_allocations()
--   public.get_turn_region_load(p_region public.turn_region_t)
--
-- Depends on 20260528000001_turn_regional_sharding_v1.sql (turn_region_t enum + turn_regions).

create table if not exists public.turn_active_allocations (
  id           bigint generated always as identity primary key,
  region       public.turn_region_t not null,
  user_scope   text        not null,
  started_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

create index if not exists turn_active_allocations_region_expires_idx
  on public.turn_active_allocations (region, expires_at);

create index if not exists turn_active_allocations_expires_at_idx
  on public.turn_active_allocations (expires_at);

-- Per-region current load + capacity utilization. NULL region = all regions.
create or replace function public.get_turn_region_load(
  p_region public.turn_region_t default null
)
returns table (
  region            public.turn_region_t,
  active_count      bigint,
  capacity_limit    integer,
  utilization_pct   numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  select r.region,
         coalesce(a.cnt, 0)::bigint as active_count,
         r.max_concurrent as capacity_limit,
         case
           when r.max_concurrent > 0
             then round(coalesce(a.cnt, 0)::numeric * 100.0 / r.max_concurrent, 2)
           else 0::numeric
         end as utilization_pct
  from public.turn_regions r
  left join (
    select aa.region, count(*)::bigint as cnt
    from public.turn_active_allocations aa
    where aa.expires_at > now()
      and (p_region is null or aa.region = p_region)
    group by aa.region
  ) a on a.region = r.region
  where r.active
    and (p_region is null or r.region = p_region);
end;
$$;

revoke all on function public.get_turn_region_load(public.turn_region_t) from public;
revoke all on function public.get_turn_region_load(public.turn_region_t) from anon;
revoke all on function public.get_turn_region_load(public.turn_region_t) from authenticated;
grant execute on function public.get_turn_region_load(public.turn_region_t) to service_role;

-- Track a new allocation. Called by SFU/edge when a relay is granted.
create or replace function public.track_turn_allocation(
  p_region     public.turn_region_t,
  p_user_scope text,
  p_ttl_seconds integer default 3600
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
 insert into public.turn_active_allocations (region, user_scope, expires_at)
 values (
   p_region,
   coalesce(p_user_scope, 'anon'),
   now() + make_interval(secs => greatest(p_ttl_seconds, 60))
 );
end;
$$;

revoke all on function public.track_turn_allocation(public.turn_region_t, text, integer) from public;
revoke all on function public.track_turn_allocation(public.turn_region_t, text, integer) from anon;
grant execute on function public.track_turn_allocation(public.turn_region_t, text, integer) to service_role;

-- Cron target: prune expired allocations every minute.
create or replace function public.cleanup_expired_turn_allocations()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
 delete from public.turn_active_allocations where expires_at <= now();
end;
$$;

revoke all on function public.cleanup_expired_turn_allocations() from public;
revoke all on function public.cleanup_expired_turn_allocations() from anon;
revoke all on function public.cleanup_expired_turn_allocations() from authenticated;
grant execute on function public.cleanup_expired_turn_allocations() to service_role;

alter table public.turn_active_allocations enable row level security;

create policy turn_active_allocations_service_only on public.turn_active_allocations
for all to service_role using (true) with check (true);
