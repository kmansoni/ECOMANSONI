begin;

create or replace function public.auth_rotate_refresh_by_device_v1(
  p_session_id uuid,
  p_device_uid text,
  p_device_secret text,
  p_new_refresh_hash text,
  p_new_refresh_expires_at timestamptz,
  p_user_agent text,
  p_ip inet
)
returns table(ok boolean, reason text, account_id uuid) language plpgsql as $$
declare
  v_device public.auth_devices%rowtype;
  v_s public.auth_sessions%rowtype;
begin
  select * into v_device from public.auth_devices where device_uid = p_device_uid;
  if v_device.id is null then ok := false; reason := 'DEVICE_NOT_REGISTERED'; account_id := null; return next; end if;
  if not public.verify_secret(p_device_secret, v_device.device_secret_hash) then ok := false; reason := 'DEVICE_SECRET_INVALID'; account_id := null; return next; end if;

  select * into v_s from public.auth_sessions where id = p_session_id;
  if v_s.id is null then ok := false; reason := 'SESSION_NOT_FOUND'; account_id := null; return next; end if;
  if v_s.status <> 'active' then ok := false; reason := 'SESSION_NOT_ACTIVE'; account_id := v_s.account_id; return next; end if;
  if v_s.device_id <> v_device.id then ok := false; reason := 'DEVICE_MISMATCH'; account_id := v_s.account_id; return next; end if;

  if v_s.refresh_expires_at < now() then
    update public.auth_sessions set status = 'expired' where id = v_s.id;
    ok := false; reason := 'REFRESH_EXPIRED'; account_id := v_s.account_id; return next;
  end if;

  update public.auth_sessions
    set refresh_token_hash = p_new_refresh_hash,
        refresh_expires_at = p_new_refresh_expires_at,
        refresh_issued_at = now(),
        last_access_at = now(),
        last_ip = p_ip,
        last_user_agent = p_user_agent
  where id = v_s.id;

  insert into public.device_active_account(device_id, account_id)
  values (v_device.id, v_s.account_id)
  on conflict (device_id) do update set account_id = excluded.account_id, switched_at = now();

  insert into public.auth_audit_events(account_id, device_id, session_id, event_type, event_data, ip, user_agent)
  values (
    v_s.account_id,
    v_s.device_id,
    v_s.id,
    'refresh.rotated_by_device',
    jsonb_build_object('reason', 'session_switch_or_restore'),
    p_ip,
    p_user_agent
  );

  ok := true;
  reason := 'OK';
  account_id := v_s.account_id;
  return next;
end $$;

commit;
