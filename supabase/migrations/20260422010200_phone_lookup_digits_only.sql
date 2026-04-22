-- Cleanup + tolerant phone matching
-- 1. Drop the temporary debug probe added in 20260422010100
-- 2. Rewrite get_email_by_phone_v1 / check_recovery_phone_email_v1 to match
--    phones by digits only, so "+79333222922" and "79333222922" are equivalent.
--    Legacy auth.users rows were observed to store phones without the leading '+'.

drop function if exists public.__debug_phone_probe_v1(text);

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

  select email into v_email
  from public.auth_accounts
  where regexp_replace(coalesce(phone_e164, ''), '\D', '', 'g') = v_digits
    and (is_banned is null or is_banned = false)
  limit 1;

  if v_email is not null then
    return v_email;
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') = v_digits
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
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_found  boolean;
begin
  if length(v_digits) < 7 or v_email = '' then
    return false;
  end if;

  select exists(
    select 1
    from public.auth_accounts
    where regexp_replace(coalesce(phone_e164, ''), '\D', '', 'g') = v_digits
      and email = v_email
      and (is_banned is null or is_banned = false)
  ) into v_found;

  if coalesce(v_found, false) then
    return true;
  end if;

  select exists(
    select 1
    from auth.users u
    where regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') = v_digits
      and lower(u.email) = v_email
  ) into v_found;

  return coalesce(v_found, false);
end;
$$;

grant execute on function public.check_recovery_phone_email_v1(text, text) to anon, authenticated;
