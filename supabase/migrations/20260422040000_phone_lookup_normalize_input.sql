-- Phone lookup: normalize input via normalize_phone_e164 before digit comparison,
-- so Russian "8xxxxxxxxxx" and "+7xxxxxxxxxx" are treated as the same number.
-- Date: 2026-04-22

create or replace function public.get_email_by_phone_v1(p_phone text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm   text := public.normalize_phone_e164(p_phone);
  v_digits text;
  v_email  text;
begin
  if v_norm is null then
    return null;
  end if;
  v_digits := regexp_replace(v_norm, '\D', '', 'g');

  select email into v_email
  from public.auth_accounts
  where regexp_replace(coalesce(public.normalize_phone_e164(phone_e164), ''), '\D', '', 'g') = v_digits
    and (is_banned is null or is_banned = false)
  limit 1;
  if v_email is not null then
    return v_email;
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where (
      regexp_replace(coalesce(public.normalize_phone_e164(u.phone), ''), '\D', '', 'g') = v_digits
      or regexp_replace(coalesce(public.normalize_phone_e164(u.raw_user_meta_data->>'phone'), ''), '\D', '', 'g') = v_digits
    )
    and u.email is not null
    and u.email <> ''
  order by u.created_at asc
  limit 1;
  if v_email is not null then
    return v_email;
  end if;

  select lower(u.email) into v_email
  from public.profiles p
  join auth.users u on u.id = p.user_id
  where regexp_replace(coalesce(public.normalize_phone_e164(p.phone), ''), '\D', '', 'g') = v_digits
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
  v_norm   text := public.normalize_phone_e164(p_phone);
  v_digits text;
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_found  boolean;
begin
  if v_norm is null or v_email = '' then
    return false;
  end if;
  v_digits := regexp_replace(v_norm, '\D', '', 'g');

  select exists(
    select 1 from public.auth_accounts
    where regexp_replace(coalesce(public.normalize_phone_e164(phone_e164), ''), '\D', '', 'g') = v_digits
      and email = v_email
      and (is_banned is null or is_banned = false)
  ) into v_found;
  if coalesce(v_found, false) then return true; end if;

  select exists(
    select 1 from auth.users u
    where (
        regexp_replace(coalesce(public.normalize_phone_e164(u.phone), ''), '\D', '', 'g') = v_digits
        or regexp_replace(coalesce(public.normalize_phone_e164(u.raw_user_meta_data->>'phone'), ''), '\D', '', 'g') = v_digits
      )
      and lower(u.email) = v_email
  ) into v_found;
  if coalesce(v_found, false) then return true; end if;

  select exists(
    select 1 from public.profiles p
    join auth.users u on u.id = p.user_id
    where regexp_replace(coalesce(public.normalize_phone_e164(p.phone), ''), '\D', '', 'g') = v_digits
      and lower(u.email) = v_email
  ) into v_found;

  return coalesce(v_found, false);
end;
$$;

grant execute on function public.check_recovery_phone_email_v1(text, text) to anon, authenticated;
