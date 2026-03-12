-- Harden TURN issuance rate-limit RPC/table privileges.
-- Ensures authenticated/anon/public roles cannot call RPC directly.

revoke all on table public.turn_issuance_rl from public;
revoke all on table public.turn_issuance_rl from anon;
revoke all on table public.turn_issuance_rl from authenticated;

do $$
declare
  fn_sig text;
begin
  for fn_sig in
    select p.oid::regprocedure::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'turn_issuance_rl_hit_v1'
  loop
    execute format('revoke all on function %s from public', fn_sig);
    execute format('revoke all on function %s from anon', fn_sig);
    execute format('revoke all on function %s from authenticated', fn_sig);
    execute format('grant execute on function %s to service_role', fn_sig);
  end loop;
end
$$;
