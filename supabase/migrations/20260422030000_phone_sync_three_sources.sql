-- Extend phone sync across auth.users, auth.users.raw_user_meta_data, and profiles.
-- Date: 2026-04-22
--
-- Builds on 20260422010000_auth_accounts_sync_legacy.sql and
-- 20260422020000_drop_password_hash_and_fix_upsert.sql:
--
--  1. Normalization helper: digits-only → E.164 with leading '+',
--     handling 8xxxxxxxxxx (Russian trunk) → +7xxxxxxxxxx.
--  2. Rewrite sync_auth_account_from_user to look at
--     auth.users.phone, raw_user_meta_data->>'phone', and profiles.phone
--     (in that priority order) and normalize the result.
--  3. New trigger on public.profiles: whenever profiles.phone is set/changed,
--     mirror it into auth_accounts (matched by owning auth.users email).
--  4. Extend get_email_by_phone_v1 with a third fallback through
--     public.profiles.phone (digits-only comparison).
--  5. Normalize all existing profiles.phone values to '+<digits>' form.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Helper: normalize to E.164
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.normalize_phone_e164(p_raw text)
returns text
language plpgsql
immutable
as $$
declare
  v_digits text;
begin
  if p_raw is null or length(trim(p_raw)) = 0 then
    return null;
  end if;
  v_digits := regexp_replace(p_raw, '\D', '', 'g');
  if length(v_digits) < 7 then
    return null;
  end if;
  -- Russian mobile "8xxxxxxxxxx" (11 digits starting with 8) → +7xxxxxxxxxx
  if length(v_digits) = 11 and left(v_digits, 1) = '8' then
    return '+7' || substr(v_digits, 2);
  end if;
  -- Local 10-digit (fallback to Russian +7)
  if length(v_digits) = 10 then
    return '+7' || v_digits;
  end if;
  return '+' || v_digits;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Trigger function on auth.users — now reads 3 sources and normalizes.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sync_auth_account_from_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(nullif(new.email, ''));
  v_profile_phone text;
  v_phone text;
begin
  -- Look up profiles.phone for the same user (may not exist yet on INSERT).
  select p.phone into v_profile_phone
  from public.profiles p
  where p.user_id = new.id
  limit 1;

  v_phone := public.normalize_phone_e164(
    coalesce(
      nullif(new.phone, ''),
      nullif(new.raw_user_meta_data->>'phone', ''),
      nullif(v_profile_phone, '')
    )
  );

  if v_email is null and v_phone is null then
    return new;
  end if;

  if v_email is not null then
    insert into public.auth_accounts (email, phone_e164, is_banned)
    values (v_email, v_phone, false)
    on conflict (email) do update
      set phone_e164 = coalesce(excluded.phone_e164, public.auth_accounts.phone_e164);
  elsif v_phone is not null then
    insert into public.auth_accounts (email, phone_e164, is_banned)
    values (null, v_phone, false)
    on conflict (phone_e164) do nothing;
  end if;

  return new;
end;
$$;

-- Re-install trigger (definition may have been updated).
drop trigger if exists on_auth_user_sync_account on auth.users;
create trigger on_auth_user_sync_account
  after insert or update of email, phone, raw_user_meta_data on auth.users
  for each row execute function public.sync_auth_account_from_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Trigger on profiles — mirror profiles.phone changes into auth_accounts.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sync_auth_account_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_phone text := public.normalize_phone_e164(new.phone);
begin
  if v_phone is null then
    return new;
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = new.user_id
  limit 1;

  if v_email is null then
    return new;
  end if;

  insert into public.auth_accounts (email, phone_e164, is_banned)
  values (v_email, v_phone, false)
  on conflict (email) do update
    set phone_e164 = coalesce(excluded.phone_e164, public.auth_accounts.phone_e164);

  return new;
end;
$$;

drop trigger if exists on_profile_sync_auth_account on public.profiles;
create trigger on_profile_sync_auth_account
  after insert or update of phone on public.profiles
  for each row execute function public.sync_auth_account_from_profile();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. get_email_by_phone_v1 with profiles fallback (digits-only match).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_email_by_phone_v1(p_phone text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_email text;
begin
  if length(v_digits) < 7 then
    return null;
  end if;

  -- Primary: auth_accounts
  select email into v_email
  from public.auth_accounts
  where regexp_replace(coalesce(phone_e164, ''), '\D', '', 'g') = v_digits
    and (is_banned is null or is_banned = false)
  limit 1;
  if v_email is not null then
    return v_email;
  end if;

  -- Fallback 1: auth.users.phone / raw_user_meta_data->>'phone'
  select lower(u.email) into v_email
  from auth.users u
  where (
      regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') = v_digits
      or regexp_replace(coalesce(u.raw_user_meta_data->>'phone', ''), '\D', '', 'g') = v_digits
    )
    and u.email is not null
    and u.email <> ''
  order by u.created_at asc
  limit 1;
  if v_email is not null then
    return v_email;
  end if;

  -- Fallback 2: profiles.phone → join auth.users for email
  select lower(u.email) into v_email
  from public.profiles p
  join auth.users u on u.id = p.user_id
  where regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = v_digits
    and u.email is not null
    and u.email <> ''
  order by u.created_at asc
  limit 1;

  return v_email;
end;
$$;

grant execute on function public.get_email_by_phone_v1(text) to anon, authenticated;

-- Same extension for check_recovery_phone_email_v1.
create or replace function public.check_recovery_phone_email_v1(p_phone text, p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_found  boolean;
begin
  if length(v_digits) < 7 or v_email = '' then
    return false;
  end if;

  select exists(
    select 1 from public.auth_accounts
    where regexp_replace(coalesce(phone_e164, ''), '\D', '', 'g') = v_digits
      and email = v_email
      and (is_banned is null or is_banned = false)
  ) into v_found;
  if coalesce(v_found, false) then return true; end if;

  select exists(
    select 1 from auth.users u
    where (
        regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') = v_digits
        or regexp_replace(coalesce(u.raw_user_meta_data->>'phone', ''), '\D', '', 'g') = v_digits
      )
      and lower(u.email) = v_email
  ) into v_found;
  if coalesce(v_found, false) then return true; end if;

  select exists(
    select 1 from public.profiles p
    join auth.users u on u.id = p.user_id
    where regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = v_digits
      and lower(u.email) = v_email
  ) into v_found;

  return coalesce(v_found, false);
end;
$$;

grant execute on function public.check_recovery_phone_email_v1(text, text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Normalize existing profiles.phone to E.164 ('+<digits>').
--    Skip rows that are already normalized or empty.
-- ─────────────────────────────────────────────────────────────────────────────
update public.profiles
set phone = public.normalize_phone_e164(phone)
where phone is not null
  and phone <> ''
  and phone is distinct from public.normalize_phone_e164(phone);
