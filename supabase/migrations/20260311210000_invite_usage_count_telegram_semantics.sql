-- Fix invite usage semantics to Telegram-like behavior:
-- 1) used_count increases only when a NEW membership row is inserted.
-- 2) max_uses checks are race-safe via SELECT ... FOR UPDATE on invite row.

create or replace function public.join_channel_by_invite(_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _row public.channel_invite_links%rowtype;
  _inserted_rows integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Auth required';
  end if;

  -- Lock invite row to make max_uses and used_count updates race-safe.
  select *
  into _row
  from public.channel_invite_links cil
  where cil.token = _token
    and cil.is_active = true
    and (cil.expires_at is null or cil.expires_at > now())
  for update
  limit 1;

  if _row.id is null then
    raise exception 'Invite not found or expired';
  end if;

  -- Telegram-like behavior: if user is already a member, treat invite open as success
  -- without consuming usage and without applying max_uses gate.
  if exists (
    select 1
    from public.channel_members cm
    where cm.channel_id = _row.channel_id
      and cm.user_id = auth.uid()
  ) then
    return _row.channel_id;
  end if;

  if _row.max_uses is not null and _row.used_count >= _row.max_uses then
    raise exception 'Invite usage limit reached';
  end if;

  insert into public.channel_members(channel_id, user_id, role)
  values (_row.channel_id, auth.uid(), 'member')
  on conflict (channel_id, user_id) do nothing;

  get diagnostics _inserted_rows = row_count;

  -- Consume invite only if user was actually added this call.
  if _inserted_rows > 0 then
    update public.channel_invite_links
    set used_count = used_count + 1
    where id = _row.id;
  end if;

  return _row.channel_id;
end;
$$;

create or replace function public.join_group_by_invite(_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _row public.group_invite_links%rowtype;
  _inserted_rows integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Auth required';
  end if;

  -- Lock invite row to make max_uses and used_count updates race-safe.
  select *
  into _row
  from public.group_invite_links gil
  where gil.token = _token
    and gil.is_active = true
    and (gil.expires_at is null or gil.expires_at > now())
  for update
  limit 1;

  if _row.id is null then
    raise exception 'Invite not found or expired';
  end if;

  -- Telegram-like behavior: if user is already a member, treat invite open as success
  -- without consuming usage and without applying max_uses gate.
  if exists (
    select 1
    from public.group_chat_members gcm
    where gcm.group_id = _row.group_id
      and gcm.user_id = auth.uid()
  ) then
    return _row.group_id;
  end if;

  if _row.max_uses is not null and _row.used_count >= _row.max_uses then
    raise exception 'Invite usage limit reached';
  end if;

  insert into public.group_chat_members(group_id, user_id, role)
  values (_row.group_id, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;

  get diagnostics _inserted_rows = row_count;

  -- Consume invite only if user was actually added this call.
  if _inserted_rows > 0 then
    update public.group_invite_links
    set used_count = used_count + 1
    where id = _row.id;
  end if;

  return _row.group_id;
end;
$$;
