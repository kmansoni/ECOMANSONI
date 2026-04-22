-- Migration: sync legacy auth.users into auth_accounts + make phone lookup tolerant
-- Date: 2026-04-22
--
-- Problem: public.auth_accounts is populated ONLY by the explicit RPC
-- auth_upsert_account_v1, called from the new multi-profile auth flow.
-- Users registered via the legacy Supabase phone/email signup (row in auth.users)
-- never had an auth_accounts row, so get_email_by_phone_v1 returned NULL for
-- phones that clearly existed in the project — e.g. +79999998888.
--
-- Fix in three parts:
--   1. Backfill auth_accounts from auth.users for every user with an email
--      (and phone if present), skipping rows that already exist.
--   2. Install a trigger on auth.users that keeps auth_accounts in sync for
--      future signups / phone updates.
--   3. Make get_email_by_phone_v1 and check_recovery_phone_email_v1 fall back
--      to auth.users when the auth_accounts row is missing, so the UI never
--      sees a legacy account as "not registered".

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Backfill
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.auth_accounts (email, phone_e164, password_hash, is_banned)
select
  lower(u.email)            as email,
  nullif(u.phone, '')       as phone_e164,
  ''                        as password_hash,
  false                     as is_banned
from auth.users u
where u.email is not null
  and u.email <> ''
  and not exists (
    select 1 from public.auth_accounts a
    where a.email = lower(u.email)
  )
on conflict do nothing;

-- For users that already had an email row but no phone, fill the phone in.
update public.auth_accounts a
set phone_e164 = nullif(u.phone, '')
from auth.users u
where a.email = lower(u.email)
  and (a.phone_e164 is null or a.phone_e164 = '')
  and u.phone is not null
  and u.phone <> ''
  and not exists (
    select 1 from public.auth_accounts a2
    where a2.phone_e164 = nullif(u.phone, '')
      and a2.email <> a.email
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Trigger: keep auth_accounts aligned with auth.users automatically
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sync_auth_account_from_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(nullif(new.email, ''));
  v_phone text := nullif(new.phone, '');
begin
  if v_email is null and v_phone is null then
    return new;
  end if;

  -- Prefer matching by email; fall back to phone.
  if v_email is not null then
    insert into public.auth_accounts (email, phone_e164, password_hash, is_banned)
    values (v_email, v_phone, '', false)
    on conflict (email) do update
      set phone_e164 = coalesce(excluded.phone_e164, public.auth_accounts.phone_e164);
  elsif v_phone is not null then
    insert into public.auth_accounts (email, phone_e164, password_hash, is_banned)
    values (null, v_phone, '', false)
    on conflict (phone_e164) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_sync_account on auth.users;
create trigger on_auth_user_sync_account
  after insert or update of email, phone on auth.users
  for each row execute function public.sync_auth_account_from_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tolerant lookup RPCs with auth.users fallback
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_email_by_phone_v1(p_phone text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := trim(p_phone);
  v_email text;
begin
  if v_phone is null or length(v_phone) < 7 then
    return null;
  end if;

  select email into v_email
  from public.auth_accounts
  where phone_e164 = v_phone
    and (is_banned is null or is_banned = false)
  limit 1;

  if v_email is not null then
    return v_email;
  end if;

  -- Fallback: legacy users that never got an auth_accounts row.
  select lower(u.email) into v_email
  from auth.users u
  where u.phone = v_phone
    and u.email is not null
    and u.email <> ''
  order by u.created_at asc
  limit 1;

  return v_email;
end;
$$;

grant execute on function public.get_email_by_phone_v1(text) to anon, authenticated;

create or replace function public.check_recovery_phone_email_v1(p_phone text, p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := trim(p_phone);
  v_email text := lower(trim(p_email));
  v_found boolean;
begin
  if v_phone is null or v_email is null or v_phone = '' or v_email = '' then
    return false;
  end if;

  select exists(
    select 1
    from public.auth_accounts
    where phone_e164 = v_phone
      and email      = v_email
      and (is_banned is null or is_banned = false)
  ) into v_found;

  if coalesce(v_found, false) then
    return true;
  end if;

  select exists(
    select 1
    from auth.users u
    where u.phone = v_phone
      and lower(u.email) = v_email
  ) into v_found;

  return coalesce(v_found, false);
end;
$$;

grant execute on function public.check_recovery_phone_email_v1(text, text) to anon, authenticated;
