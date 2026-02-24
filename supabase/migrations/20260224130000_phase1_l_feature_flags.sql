-- Phase 1 EPIC L: Feature flags for gradual rollout (canary deployment)
-- Allows enabling rate limiting for a percentage of users (0-100)

create table if not exists public.feature_flags (
  flag_name text primary key,
  enabled boolean not null default false,
  rollout_percentage integer not null default 0 check (rollout_percentage >= 0 and rollout_percentage <= 100),
  config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_feature_flags_enabled
  on public.feature_flags(enabled, rollout_percentage) where enabled = true;

-- Seed rate_limit_enforcement flag at 0% (disabled by default)
insert into public.feature_flags (flag_name, enabled, rollout_percentage, config)
values ('rate_limit_enforcement', false, 0, '{"actions": ["send_message", "media_upload", "create_post", "follow", "search", "api_call"]}'::jsonb)
on conflict (flag_name) do nothing;

-- Helper function: check if feature is enabled for a given user
create or replace function public.is_feature_enabled_for_user_v1(
  p_flag_name text,
  p_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_flag record;
  v_hash bigint;
  v_mod int;
begin
  select enabled, rollout_percentage
  into v_flag
  from public.feature_flags
  where flag_name = p_flag_name;

  if not found then
    return false;
  end if;

  if not v_flag.enabled then
    return false;
  end if;

  if v_flag.rollout_percentage = 0 then
    return false;
  end if;

  if v_flag.rollout_percentage >= 100 then
    return true;
  end if;

  -- Hash-based bucketing: deterministic % rollout
  v_hash := ('x' || substring(md5(p_user_id::text) from 1 for 15))::bit(60)::bigint;
  v_mod := abs(v_hash % 100);

  return v_mod < v_flag.rollout_percentage;
end;
$$;

comment on function public.is_feature_enabled_for_user_v1 is
  'Phase 1 EPIC L: Check if a feature flag is enabled for a given user (deterministic hash-based rollout)';
