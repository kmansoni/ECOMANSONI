-- TURN regional sharding for 1B users
-- Users routed to nearest TURN region based on IP geolocation
-- 
-- Regions supported:
-- - tr (Turkey)
-- - ae (UAE) 
-- - eu (Europe fallback)
-- - global (default)

create type public.turn_region_t as enum ('tr', 'ae', 'eu', 'global');

create table if not exists public.turn_regions (
  region public.turn_region_t not null primary key,
  domain text not null,
  public_ip inet not null,
  active boolean not null default true,
  weight int not null default 100, -- traffic percentage
  max_concurrent int not null default 10000, -- per region
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Insert initial regions
insert into public.turn_regions (region, domain, public_ip, weight) values
  ('tr', 'turn-tr.mansoni.ru', '185.1.1.1'::inet, 25),
  ('ae', 'turn-ae.mansoni.ru', '185.2.2.2'::inet, 25),
  ('eu', 'turn-eu.mansoni.ru', '185.3.3.3'::inet, 25),
  ('global', 'turn.mansoni.ru', '185.4.4.4'::inet, 25)
on conflict (region) do update set
  domain = excluded.domain,
  public_ip = excluded.public_ip,
  active = excluded.active,
  weight = excluded.weight,
  updated_at = now();

-- Function: select optimal TURN region for user
create or replace function public.select_turn_region(
  p_client_ip inet,
  p_puid text default 'anon'
)
returns table (
  region public.turn_region_t,
  domain text,
  turn_urls jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_ip inet := p_client_ip;
  v_region public.turn_region_t;
  v_lat float;
  v_lon float;
begin
  -- Geo lookup (placeholder - integrate with geoip service)
  -- TR: 35.0-42.0 lat, 26.0-45.0 lon
  -- AE: 22.0-26.0 lat, 51.0-57.0 lon
  -- EU fallback
  
  select t.latitude, t.longitude 
  into v_lat, v_lon
  from public.geoip_lookup(v_client_ip::text) t
  limit 1;

  if v_lat is not null then
    if v_lat between 35.0 and 42.0 and v_lon between 26.0 and 45.0 then
      v_region := 'tr';
    elsif v_lat between 22.0 and 26.0 and v_lon between 51.0 and 57.0 then
      v_region := 'ae';
    else
      v_region := 'eu';
    end if;
  else
    v_region := 'global';
  end if;

  return query
  select r.region, r.domain, 
    to_jsonb(array[
      format('turn:%s:3478?transport=udp', r.domain),
      format('turn:%s:3478?transport=tcp', r.domain),
      format('turns:%s:5349?transport=tcp', r.domain)
    ]) as turn_urls
  from public.turn_regions r
  where r.region = v_region and r.active;
end;
$$;

revoke all on function public.select_turn_region(inet, text) from public;
grant execute on function public.select_turn_region(inet, text) to service_role;

-- GeoIP helper function (stub - replace with actual MaxMind or ipapi integration)
create or replace function public.geoip_lookup(
  p_ip text
)
returns table (
  latitude float,
  longitude float,
  country_code text,
  city_name text
)
language plpgsql
as $$
begin
  -- TODO: Integrate with MaxMind GeoIP2 or external API
  -- For now, return null to trigger global fallback
  return query select null::float, null::float, null::text, null::text;
end;
$$;

-- View: active TURN capacity per region
create or replace view public.turn_region_capacity as
select 
  region,
  domain,
  max_concurrent,
  weight,
  active,
  -- Estimate current load (placeholder)
  case 
    when active then max_concurrent * (weight::float / 100)
    else 0
  end as estimated_capacity
from public.turn_regions;

-- RLS for turn_regions (admin-only write)
alter table public.turn_regions enable row level security;
create policy turn_regions_admin_write on public.turn_regions
  for all to authenticated
  using (auth.uid() in (select id from public.admin_users))
  with check (auth.uid() in (select id from public.admin_users));

create policy turn_regions_read on public.turn_regions
  for select to service_role
  using (true);