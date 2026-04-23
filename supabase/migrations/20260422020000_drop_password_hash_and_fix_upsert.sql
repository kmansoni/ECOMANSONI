-- Cleanup: drop dead auth_accounts.password_hash column + fix auth_upsert_account_v1
-- Date: 2026-04-22
-- ALLOW_DESTRUCTIVE_MIGRATION: password_hash is a dead column — never written
-- and never read. Real passwords live in auth.users.encrypted_password.
--
-- 1. auth_accounts.password_hash was introduced in 20260226010000 but is never
--    written by any RPC and never read by any login/recovery path.
--    Real passwords live in auth.users.encrypted_password (native GoTrue).
--    Drop the dead column to prevent confusion.
--
-- 2. auth_upsert_account_v1 previously returned the id of an existing row
--    without updating phone_e164/email. That meant a registration with a
--    phone could not attach the phone to an already-present row (e.g. the
--    one created by the backfill). Fix: update the matched row with any
--    non-null new values before returning the id.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drop the dead column
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.auth_accounts drop column if exists password_hash;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rewrite upsert to actually upsert phone/email on existing rows
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.auth_upsert_account_v1(
  p_phone_e164 text,
  p_email text
)
returns table(account_id uuid) language plpgsql as $$
declare
  v_id uuid;
  v_email text := lower(nullif(trim(p_email), ''));
  v_phone text := nullif(trim(p_phone_e164), '');
begin
  -- Prefer match by email (stable key), fall back to phone.
  if v_email is not null then
    select id into v_id from public.auth_accounts where email = v_email limit 1;
  end if;
  if v_id is null and v_phone is not null then
    select id into v_id from public.auth_accounts where phone_e164 = v_phone limit 1;
  end if;

  if v_id is null then
    insert into public.auth_accounts(phone_e164, email)
    values (v_phone, v_email)
    returning id into v_id;
  else
    update public.auth_accounts
    set phone_e164 = coalesce(v_phone, phone_e164),
        email      = coalesce(v_email, email)
    where id = v_id;
  end if;

  account_id := v_id;
  return next;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Backfill phone_e164 for khan_mansoni@icloud.com (and similar) from
--    auth.users.raw_user_meta_data->>'phone' or public.profiles.phone.
--    Digits-only → E.164 with leading '+'. Skips rows whose phone_e164 is
--    already set to avoid overwriting deliberate values.
-- ─────────────────────────────────────────────────────────────────────────────
with candidates as (
  select
    a.id as account_id,
    a.email,
    regexp_replace(
      coalesce(
        nullif(u.phone, ''),
        nullif(u.raw_user_meta_data->>'phone', ''),
        nullif(p.phone, '')
      ),
      '\D', '', 'g'
    ) as digits
  from public.auth_accounts a
  left join auth.users u on lower(u.email) = a.email
  left join public.profiles p on p.user_id = u.id
  where (a.phone_e164 is null or a.phone_e164 = '')
)
update public.auth_accounts a
set phone_e164 = case
  when length(c.digits) = 11 and left(c.digits, 1) = '8' then '+7' || substr(c.digits, 2)
  when length(c.digits) = 10 then '+7' || c.digits
  when length(c.digits) >= 7 then '+' || c.digits
  else null
end
from candidates c
where a.id = c.account_id
  and c.digits is not null
  and length(c.digits) >= 7
  and not exists (
    -- Don't violate the unique constraint on phone_e164.
    select 1 from public.auth_accounts a2
    where a2.phone_e164 = case
      when length(c.digits) = 11 and left(c.digits, 1) = '8' then '+7' || substr(c.digits, 2)
      when length(c.digits) = 10 then '+7' || c.digits
      when length(c.digits) >= 7 then '+' || c.digits
    end
    and a2.id <> a.id
  );
