-- Phase 1 EPIC L: Manual canary rollout test (SQL-based)
-- Use this in Supabase Dashboard → SQL Editor

-- 1. Check feature flag state (should be disabled by default)
select * from public.feature_flags where flag_name = 'rate_limit_enforcement';

-- 2. Test is_feature_enabled_for_user_v1 with rollout_percentage = 0
select public.is_feature_enabled_for_user_v1('rate_limit_enforcement', gen_random_uuid()) as enabled_at_0pct;
-- Expected: false (0% rollout = disabled for all users)

-- 3. Enable flag at 50% rollout
update public.feature_flags
set enabled = true, rollout_percentage = 50
where flag_name = 'rate_limit_enforcement';

-- 4. Test deterministic bucketing (same user_id always returns same result)
do $$
declare
  test_user_id uuid := gen_random_uuid();
  result_1 boolean;
  result_2 boolean;
begin
  result_1 := public.is_feature_enabled_for_user_v1('rate_limit_enforcement', test_user_id);
  result_2 := public.is_feature_enabled_for_user_v1('rate_limit_enforcement', test_user_id);
  
  if result_1 != result_2 then
    raise exception 'Non-deterministic bucketing detected: % vs %', result_1, result_2;
  end if;
  
  raise notice 'User % bucketing result: % (consistent)', test_user_id, result_1;
end;
$$;

-- 5. Test rollout distribution (should be ~50% enabled at 50% rollout)
with test_users as (
  select gen_random_uuid() as user_id
  from generate_series(1, 1000)
)
select
  sum(case when public.is_feature_enabled_for_user_v1('rate_limit_enforcement', user_id) then 1 else 0 end) as enabled_count,
  count(*) as total_count,
  round(100.0 * sum(case when public.is_feature_enabled_for_user_v1('rate_limit_enforcement', user_id) then 1 else 0 end) / count(*), 2) as enabled_percentage
from test_users;
-- Expected: ~500/1000 (50%)

-- 6. Enable at 100% rollout
update public.feature_flags
set enabled = true, rollout_percentage = 100
where flag_name = 'rate_limit_enforcement';

-- 7. Test 100% rollout (all users should be enabled)
select public.is_feature_enabled_for_user_v1('rate_limit_enforcement', gen_random_uuid()) as enabled_at_100pct;
-- Expected: true (100% rollout = enabled for all users)

-- 8. Disable flag for cleanup
update public.feature_flags
set enabled = false, rollout_percentage = 0
where flag_name = 'rate_limit_enforcement';

-- Verification: Check final state
select * from public.feature_flags where flag_name = 'rate_limit_enforcement';
