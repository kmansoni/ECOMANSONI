-- Migration: phone-based auth RPC helpers
-- Date: 2026-04-22
--
-- Provides two SECURITY DEFINER functions for the phone-first auth flow:
--   1. get_email_by_phone_v1  – look up the email registered for a phone number
--   2. check_recovery_phone_email_v1 – verify phone+email belong to the same account

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. get_email_by_phone_v1
--    Returns the email linked to p_phone, or NULL if not found / banned.
--    Called before sending OTP so the UI can route to login or registration.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function get_email_by_phone_v1(p_phone text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if p_phone is null or length(trim(p_phone)) < 7 then
    return null;
  end if;

  select email into v_email
  from auth_accounts
  where phone_e164 = trim(p_phone)
    and (is_banned is null or is_banned = false)
  limit 1;

  return v_email;
end;
$$;

-- Allow anonymous callers (user may not have a session when adding an account)
grant execute on function get_email_by_phone_v1(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. check_recovery_phone_email_v1
--    Returns TRUE only when p_phone and p_email belong to the same non-banned
--    record in auth_accounts.  Used as the server-side gate before the
--    4-factor recovery OTP is sent.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function check_recovery_phone_email_v1(p_phone text, p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_found boolean;
begin
  if p_phone is null or p_email is null then
    return false;
  end if;

  select exists(
    select 1
    from auth_accounts
    where phone_e164 = trim(p_phone)
      and email      = lower(trim(p_email))
      and (is_banned is null or is_banned = false)
  ) into v_found;

  return coalesce(v_found, false);
end;
$$;

grant execute on function check_recovery_phone_email_v1(text, text) to anon, authenticated;
