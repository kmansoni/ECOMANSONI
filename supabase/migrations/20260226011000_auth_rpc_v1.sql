begin;

create extension if not exists pgcrypto;

create or replace function public.verify_secret(secret text, secret_hash text)
returns boolean language sql immutable as $$
  select (extensions.crypt(secret, secret_hash) = secret_hash);
$$;

create or replace function public.hash_secret(secret text)
returns text language sql immutable as $$
  select extensions.crypt(secret, extensions.gen_salt('bf', 12));
$$;

create or replace function public.auth_register_device_v1(
  p_device_uid text,
  p_device_secret text,
  p_platform text,
  p_device_model text,
  p_os_version text,
  p_app_version text,
  p_user_agent text,
  p_ip inet
)
returns table(device_id uuid) language plpgsql as $$
declare
  v_device_id uuid;
begin
  select id into v_device_id
  from public.auth_devices
  where device_uid = p_device_uid;

  if v_device_id is null then
    insert into public.auth_devices(device_uid, device_secret_hash, platform, device_model, os_version, app_version, last_seen_at, last_ip, last_user_agent)
    values (p_device_uid, public.hash_secret(p_device_secret), p_platform, p_device_model, p_os_version, p_app_version, now(), p_ip, p_user_agent)
    returning id into v_device_id;
  else
    update public.auth_devices
      set last_seen_at = now(),
          last_ip = p_ip,
          last_user_agent = p_user_agent,
          device_model = coalesce(p_device_model, device_model),
          os_version = coalesce(p_os_version, os_version),
          app_version = coalesce(p_app_version, app_version)
    where id = v_device_id;
  end if;

  insert into public.auth_audit_events(device_id, event_type, event_data, ip, user_agent)
  values (v_device_id, 'device.register_or_seen', jsonb_build_object('platform', p_platform), p_ip, p_user_agent);

  device_id := v_device_id;
  return next;
end $$;

create or replace function public.auth_upsert_account_v1(
  p_phone_e164 text,
  p_email text
)
returns table(account_id uuid) language plpgsql as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.auth_accounts
  where (p_phone_e164 is not null and phone_e164 = p_phone_e164)
     or (p_email is not null and email = p_email);

  if v_id is null then
    insert into public.auth_accounts(phone_e164, email)
    values (p_phone_e164, p_email)
    returning id into v_id;
  end if;

  account_id := v_id;
  return next;
end $$;

create or replace function public.auth_create_session_v1(
  p_account_id uuid,
  p_device_uid text,
  p_device_secret text,
  p_refresh_token_hash text,
  p_refresh_expires_at timestamptz,
  p_user_agent text,
  p_ip inet
)
returns table(session_id uuid) language plpgsql as $$
declare
  v_device public.auth_devices%rowtype;
  v_sid uuid;
begin
  select * into v_device from public.auth_devices where device_uid = p_device_uid;
  if v_device.id is null then
    raise exception 'DEVICE_NOT_REGISTERED';
  end if;

  if not public.verify_secret(p_device_secret, v_device.device_secret_hash) then
    raise exception 'DEVICE_SECRET_INVALID';
  end if;

  insert into public.auth_sessions(account_id, device_id, refresh_token_hash, refresh_expires_at, last_access_at, last_ip, last_user_agent)
  values (p_account_id, v_device.id, p_refresh_token_hash, p_refresh_expires_at, now(), p_ip, p_user_agent)
  returning id into v_sid;

  insert into public.device_active_account(device_id, account_id)
  values (v_device.id, p_account_id)
  on conflict (device_id) do update set account_id = excluded.account_id, switched_at = now();

  insert into public.auth_audit_events(account_id, device_id, session_id, event_type, ip, user_agent)
  values (p_account_id, v_device.id, v_sid, 'session.created', p_ip, p_user_agent);

  session_id := v_sid;
  return next;
end $$;

create or replace function public.auth_rotate_refresh_v1(
  p_session_id uuid,
  p_device_uid text,
  p_device_secret text,
  p_presented_refresh_hash text,
  p_new_refresh_hash text,
  p_new_refresh_expires_at timestamptz,
  p_user_agent text,
  p_ip inet
)
returns table(ok boolean, reason text) language plpgsql as $$
declare
  v_device public.auth_devices%rowtype;
  v_s public.auth_sessions%rowtype;
begin
  select * into v_device from public.auth_devices where device_uid = p_device_uid;
  if v_device.id is null then ok := false; reason := 'DEVICE_NOT_REGISTERED'; return next; end if;
  if not public.verify_secret(p_device_secret, v_device.device_secret_hash) then ok := false; reason := 'DEVICE_SECRET_INVALID'; return next; end if;

  select * into v_s from public.auth_sessions where id = p_session_id;
  if v_s.id is null then ok := false; reason := 'SESSION_NOT_FOUND'; return next; end if;
  if v_s.status <> 'active' then ok := false; reason := 'SESSION_NOT_ACTIVE'; return next; end if;
  if v_s.device_id <> v_device.id then ok := false; reason := 'DEVICE_MISMATCH'; return next; end if;
  if v_s.refresh_expires_at < now() then
    update public.auth_sessions set status='expired' where id=v_s.id;
    ok := false; reason := 'REFRESH_EXPIRED'; return next;
  end if;

  if v_s.refresh_token_hash <> p_presented_refresh_hash then
    update public.auth_sessions
      set status='revoked',
          reuse_detected_at = now()
    where id = v_s.id;

    insert into public.auth_audit_events(account_id, device_id, session_id, event_type, event_data, ip, user_agent)
    values (v_s.account_id, v_s.device_id, v_s.id, 'refresh.reuse_detected', jsonb_build_object('presented','mismatch'), p_ip, p_user_agent);

    ok := false; reason := 'REFRESH_REUSE_DETECTED'; return next;
  end if;

  update public.auth_sessions
    set refresh_token_hash = p_new_refresh_hash,
        refresh_expires_at = p_new_refresh_expires_at,
        refresh_issued_at = now(),
        last_access_at = now(),
        last_ip = p_ip,
        last_user_agent = p_user_agent
  where id = v_s.id;

  insert into public.auth_audit_events(account_id, device_id, session_id, event_type, ip, user_agent)
  values (v_s.account_id, v_s.device_id, v_s.id, 'refresh.rotated', p_ip, p_user_agent);

  ok := true; reason := 'OK'; return next;
end $$;

create or replace function public.auth_switch_active_account_v1(
  p_device_uid text,
  p_device_secret text,
  p_account_id uuid,
  p_user_agent text,
  p_ip inet
)
returns table(ok boolean, reason text) language plpgsql as $$
declare
  v_device public.auth_devices%rowtype;
  v_has boolean;
begin
  select * into v_device from public.auth_devices where device_uid=p_device_uid;
  if v_device.id is null then ok:=false; reason:='DEVICE_NOT_REGISTERED'; return next; end if;
  if not public.verify_secret(p_device_secret, v_device.device_secret_hash) then ok:=false; reason:='DEVICE_SECRET_INVALID'; return next; end if;

  select exists(
    select 1 from public.auth_sessions s
    where s.device_id = v_device.id and s.account_id = p_account_id and s.status='active'
  ) into v_has;

  if not v_has then ok:=false; reason:='NO_ACTIVE_SESSION_FOR_ACCOUNT_ON_DEVICE'; return next; end if;

  insert into public.device_active_account(device_id, account_id)
  values (v_device.id, p_account_id)
  on conflict (device_id) do update set account_id=excluded.account_id, switched_at=now();

  insert into public.auth_audit_events(account_id, device_id, event_type, ip, user_agent)
  values (p_account_id, v_device.id, 'device.active_account_switched', p_ip, p_user_agent);

  ok:=true; reason:='OK'; return next;
end $$;

create or replace function public.auth_revoke_session_v1(
  p_session_id uuid,
  p_device_uid text,
  p_device_secret text,
  p_user_agent text,
  p_ip inet
)
returns table(ok boolean, reason text) language plpgsql as $$
declare
  v_device public.auth_devices%rowtype;
  v_s public.auth_sessions%rowtype;
begin
  select * into v_device from public.auth_devices where device_uid=p_device_uid;
  if v_device.id is null then ok:=false; reason:='DEVICE_NOT_REGISTERED'; return next; end if;
  if not public.verify_secret(p_device_secret, v_device.device_secret_hash) then ok:=false; reason:='DEVICE_SECRET_INVALID'; return next; end if;

  select * into v_s from public.auth_sessions where id=p_session_id;
  if v_s.id is null then ok:=false; reason:='SESSION_NOT_FOUND'; return next; end if;
  if v_s.device_id <> v_device.id then ok:=false; reason:='DEVICE_MISMATCH'; return next; end if;

  update public.auth_sessions set status='revoked', updated_at=now() where id=v_s.id;

  insert into public.auth_audit_events(account_id, device_id, session_id, event_type, ip, user_agent)
  values (v_s.account_id, v_device.id, v_s.id, 'session.revoked', p_ip, p_user_agent);

  ok:=true; reason:='OK'; return next;
end $$;

commit;
