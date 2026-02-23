-- TURN issuance rate-limit (user + ip) for edge function `turn-credentials`.
--
-- Goal: prevent abuse and make rate limiting reconnect-proof (no in-memory buckets).

create table if not exists public.turn_issuance_rl (
  user_id uuid not null,
  ip text not null,
  bucket_ts timestamptz not null,
  cnt int not null default 0,
  primary key (user_id, ip, bucket_ts)
);

alter table public.turn_issuance_rl enable row level security;

revoke all on table public.turn_issuance_rl from public;
revoke all on table public.turn_issuance_rl from anon;
revoke all on table public.turn_issuance_rl from authenticated;

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
  v_cnt int;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  v_ip := coalesce(nullif(trim(p_ip), ''), 'unknown');
  v_ip := left(v_ip, 80);

  if p_max is null or p_max < 1 then
    p_max := 1;
  end if;

  insert into public.turn_issuance_rl(user_id, ip, bucket_ts, cnt)
  values (p_user_id, v_ip, v_bucket, 1)
  on conflict (user_id, ip, bucket_ts) do update
    set cnt = public.turn_issuance_rl.cnt + 1
  returning public.turn_issuance_rl.cnt
  into v_cnt;

  allowed := (v_cnt <= p_max);
  cnt := v_cnt;
  bucket_ts := v_bucket;
  return next;
end;
$$;

revoke all on function public.turn_issuance_rl_hit_v1(uuid, text, int) from public;
grant execute on function public.turn_issuance_rl_hit_v1(uuid, text, int) to service_role;
