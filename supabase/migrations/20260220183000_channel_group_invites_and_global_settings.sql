-- Channel/Group invite links + user global community settings

create table if not exists public.user_channel_group_settings (
  user_id uuid primary key default auth.uid(),
  allow_channel_invites boolean not null default true,
  allow_group_invites boolean not null default true,
  auto_join_by_invite boolean not null default false,
  mute_new_communities boolean not null default false,
  show_media_preview boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.channel_invite_links (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  token text not null unique,
  created_by uuid not null default auth.uid(),
  is_active boolean not null default true,
  max_uses integer,
  used_count integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_uses is null or max_uses > 0),
  check (used_count >= 0)
);

create table if not exists public.group_invite_links (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.group_chats(id) on delete cascade,
  token text not null unique,
  created_by uuid not null default auth.uid(),
  is_active boolean not null default true,
  max_uses integer,
  used_count integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_uses is null or max_uses > 0),
  check (used_count >= 0)
);

create index if not exists idx_channel_invite_links_channel on public.channel_invite_links(channel_id, is_active);
create index if not exists idx_group_invite_links_group on public.group_invite_links(group_id, is_active);
create index if not exists idx_user_channel_group_settings_updated on public.user_channel_group_settings(updated_at desc);

alter table public.user_channel_group_settings enable row level security;
alter table public.channel_invite_links enable row level security;
alter table public.group_invite_links enable row level security;

drop policy if exists "user_community_settings_owner_select" on public.user_channel_group_settings;
create policy "user_community_settings_owner_select"
on public.user_channel_group_settings
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_community_settings_owner_insert" on public.user_channel_group_settings;
create policy "user_community_settings_owner_insert"
on public.user_channel_group_settings
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_community_settings_owner_update" on public.user_channel_group_settings;
create policy "user_community_settings_owner_update"
on public.user_channel_group_settings
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "channel_invites_members_select" on public.channel_invite_links;
create policy "channel_invites_members_select"
on public.channel_invite_links
for select
to authenticated
using (public.is_channel_member(channel_id, auth.uid()));

drop policy if exists "channel_invites_admin_insert" on public.channel_invite_links;
create policy "channel_invites_admin_insert"
on public.channel_invite_links
for insert
to authenticated
with check (public.is_channel_admin(channel_id, auth.uid()) and created_by = auth.uid());

drop policy if exists "channel_invites_admin_update" on public.channel_invite_links;
create policy "channel_invites_admin_update"
on public.channel_invite_links
for update
to authenticated
using (public.is_channel_admin(channel_id, auth.uid()))
with check (public.is_channel_admin(channel_id, auth.uid()));

drop policy if exists "group_invites_members_select" on public.group_invite_links;
create policy "group_invites_members_select"
on public.group_invite_links
for select
to authenticated
using (public.is_group_member(group_id, auth.uid()));

drop policy if exists "group_invites_admin_insert" on public.group_invite_links;
create policy "group_invites_admin_insert"
on public.group_invite_links
for insert
to authenticated
with check (
  exists (
    select 1
    from public.group_chat_members gcm
    where gcm.group_id = group_invite_links.group_id
      and gcm.user_id = auth.uid()
      and gcm.role in ('owner', 'admin')
  ) and created_by = auth.uid()
);

drop policy if exists "group_invites_admin_update" on public.group_invite_links;
create policy "group_invites_admin_update"
on public.group_invite_links
for update
to authenticated
using (
  exists (
    select 1
    from public.group_chat_members gcm
    where gcm.group_id = group_invite_links.group_id
      and gcm.user_id = auth.uid()
      and gcm.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.group_chat_members gcm
    where gcm.group_id = group_invite_links.group_id
      and gcm.user_id = auth.uid()
      and gcm.role in ('owner', 'admin')
  )
);

create or replace function public.set_community_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_channel_group_settings_updated_at on public.user_channel_group_settings;
create trigger trg_user_channel_group_settings_updated_at
before update on public.user_channel_group_settings
for each row execute function public.set_community_updated_at();

drop trigger if exists trg_channel_invite_links_updated_at on public.channel_invite_links;
create trigger trg_channel_invite_links_updated_at
before update on public.channel_invite_links
for each row execute function public.set_community_updated_at();

drop trigger if exists trg_group_invite_links_updated_at on public.group_invite_links;
create trigger trg_group_invite_links_updated_at
before update on public.group_invite_links
for each row execute function public.set_community_updated_at();

create or replace function public.create_channel_invite(
  _channel_id uuid,
  _max_uses integer default null,
  _ttl_hours integer default 168
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _token text;
  _expires timestamptz;
begin
  if not public.is_channel_admin(_channel_id, auth.uid()) then
    raise exception 'Not allowed';
  end if;

  _token := encode(gen_random_bytes(16), 'hex');
  _expires := now() + make_interval(hours => greatest(_ttl_hours, 1));

  insert into public.channel_invite_links(channel_id, token, created_by, max_uses, expires_at)
  values (_channel_id, _token, auth.uid(), _max_uses, _expires);

  return _token;
end;
$$;

create or replace function public.join_channel_by_invite(_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _row public.channel_invite_links%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Auth required';
  end if;

  select *
  into _row
  from public.channel_invite_links cil
  where cil.token = _token
    and cil.is_active = true
    and (cil.expires_at is null or cil.expires_at > now())
  limit 1;

  if _row.id is null then
    raise exception 'Invite not found or expired';
  end if;

  if _row.max_uses is not null and _row.used_count >= _row.max_uses then
    raise exception 'Invite usage limit reached';
  end if;

  insert into public.channel_members(channel_id, user_id, role)
  values (_row.channel_id, auth.uid(), 'member')
  on conflict (channel_id, user_id) do nothing;

  update public.channel_invite_links
  set used_count = used_count + 1
  where id = _row.id;

  return _row.channel_id;
end;
$$;

create or replace function public.create_group_invite(
  _group_id uuid,
  _max_uses integer default null,
  _ttl_hours integer default 168
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _token text;
  _expires timestamptz;
begin
  if not exists (
    select 1
    from public.group_chat_members gcm
    where gcm.group_id = _group_id
      and gcm.user_id = auth.uid()
      and gcm.role in ('owner', 'admin')
  ) then
    raise exception 'Not allowed';
  end if;

  _token := encode(gen_random_bytes(16), 'hex');
  _expires := now() + make_interval(hours => greatest(_ttl_hours, 1));

  insert into public.group_invite_links(group_id, token, created_by, max_uses, expires_at)
  values (_group_id, _token, auth.uid(), _max_uses, _expires);

  return _token;
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
begin
  if auth.uid() is null then
    raise exception 'Auth required';
  end if;

  select *
  into _row
  from public.group_invite_links gil
  where gil.token = _token
    and gil.is_active = true
    and (gil.expires_at is null or gil.expires_at > now())
  limit 1;

  if _row.id is null then
    raise exception 'Invite not found or expired';
  end if;

  if _row.max_uses is not null and _row.used_count >= _row.max_uses then
    raise exception 'Invite usage limit reached';
  end if;

  insert into public.group_chat_members(group_id, user_id, role)
  values (_row.group_id, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;

  update public.group_invite_links
  set used_count = used_count + 1
  where id = _row.id;

  return _row.group_id;
end;
$$;

grant execute on function public.create_channel_invite(uuid, integer, integer) to authenticated;
grant execute on function public.join_channel_by_invite(text) to authenticated;
grant execute on function public.create_group_invite(uuid, integer, integer) to authenticated;
grant execute on function public.join_group_by_invite(text) to authenticated;

