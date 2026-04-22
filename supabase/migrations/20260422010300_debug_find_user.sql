create or replace function public.__debug_find_user_v1(p_needle text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'auth_users', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id, 'email', u.email, 'phone', u.phone,
        'raw_user_meta_data', u.raw_user_meta_data,
        'created_at', u.created_at,
        'email_confirmed_at', u.email_confirmed_at,
        'phone_confirmed_at', u.phone_confirmed_at,
        'banned_until', u.banned_until
      )),'[]'::jsonb)
      from auth.users u
      where u.email ilike '%'||p_needle||'%'
         or u.phone ilike '%'||p_needle||'%'
         or u.raw_user_meta_data::text ilike '%'||p_needle||'%'
      limit 20
    ),
    'auth_accounts', (
      select coalesce(jsonb_agg(to_jsonb(a.*)),'[]'::jsonb)
      from public.auth_accounts a
      where a.email ilike '%'||p_needle||'%'
         or a.phone_e164 ilike '%'||p_needle||'%'
      limit 20
    ),
    'profiles', (
      select coalesce(jsonb_agg(to_jsonb(p.*)),'[]'::jsonb)
      from public.profiles p
      where to_jsonb(p.*)::text ilike '%'||p_needle||'%'
      limit 20
    )
  ) into v;
  return v;
end; $$;
grant execute on function public.__debug_find_user_v1(text) to anon, authenticated;
