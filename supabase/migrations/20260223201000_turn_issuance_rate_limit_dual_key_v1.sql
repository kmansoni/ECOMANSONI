-- TURN issuance rate-limit: dual-key (user+ip AND user-only).
--
-- Why:
-- - IP may be missing/proxy-shared (NAT/edge)
-- - user-only cap prevents bypass when ip is 'unknown'
--
-- This replaces turn_issuance_rl_hit_v1 to increment BOTH keys per request:
-- - (user_id, ip, bucket)
-- - (user_id, '*', bucket)
-- and denies when either counter exceeds p_max.

create or replace function public.turn_issuance_rl_hit_v1(
  p_user_id uuid,
  p_ip text,
  p_max int
)
returns table (
  allowed boolean,
  cnt int,
  bucket_ts timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bucket timestamptz := date_trunc('minute', now());
  v_ip text;
  v_cnt_ip int;
  v_cnt_user int;
  v_max int;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  v_ip := coalesce(nullif(trim(p_ip), ''), 'unknown');
  v_ip := left(v_ip, 80);

  v_max := coalesce(p_max, 1);
  if v_max < 1 then v_max := 1; end if;

  -- 1) user+ip bucket
  insert into public.turn_issuance_rl(user_id, ip, bucket_ts, cnt)
  values (p_user_id, v_ip, v_bucket, 1)
  on conflict (user_id, ip, bucket_ts) do update
    set cnt = public.turn_issuance_rl.cnt + 1
  returning public.turn_issuance_rl.cnt
  into v_cnt_ip;

  -- 2) user-only bucket (ip='*')
  insert into public.turn_issuance_rl(user_id, ip, bucket_ts, cnt)
  values (p_user_id, '*', v_bucket, 1)
  on conflict (user_id, ip, bucket_ts) do update
    set cnt = public.turn_issuance_rl.cnt + 1
  returning public.turn_issuance_rl.cnt
  into v_cnt_user;

  allowed := (v_cnt_ip <= v_max) and (v_cnt_user <= v_max);
  cnt := greatest(v_cnt_ip, v_cnt_user);
  bucket_ts := v_bucket;
  return next;
end;
$$;

revoke all on function public.turn_issuance_rl_hit_v1(uuid, text, int) from public;
grant execute on function public.turn_issuance_rl_hit_v1(uuid, text, int) to service_role;
