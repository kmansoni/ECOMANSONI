-- Diagnostic RPC: count rows matching a phone fragment. TEMPORARY — drop after use.
create or replace function public.__debug_phone_probe_v1(p_fragment text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'auth_users_total', (select count(*) from auth.users),
    'auth_accounts_total', (select count(*) from public.auth_accounts),
    'auth_users_match', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'phone', u.phone,
        'created_at', u.created_at
      )), '[]'::jsonb)
      from auth.users u
      where u.phone ilike '%' || p_fragment || '%'
         or u.email ilike '%' || p_fragment || '%'
      limit 10
    ),
    'auth_accounts_match', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'email', a.email,
        'phone_e164', a.phone_e164,
        'is_banned', a.is_banned
      )), '[]'::jsonb)
      from public.auth_accounts a
      where a.phone_e164 ilike '%' || p_fragment || '%'
         or a.email ilike '%' || p_fragment || '%'
      limit 10
    )
  ) into v;
  return v;
end;
$$;

grant execute on function public.__debug_phone_probe_v1(text) to anon, authenticated;
