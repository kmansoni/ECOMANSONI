-- Channel capabilities engine (scalable to large feature catalogs)

create table if not exists public.channel_capability_catalog (
  key text primary key,
  domain text not null,
  title text not null,
  description text,
  is_active boolean not null default true,
  default_params jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.channel_role_capabilities (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('owner', 'admin', 'member', 'guest')),
  capability_key text not null references public.channel_capability_catalog(key) on delete cascade,
  is_allowed boolean not null default true,
  created_at timestamptz not null default now(),
  unique (role, capability_key)
);

create table if not exists public.channel_capability_overrides (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  capability_key text not null references public.channel_capability_catalog(key) on delete cascade,
  is_enabled boolean not null default true,
  params jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_id, capability_key)
);

create index if not exists idx_channel_capability_catalog_domain_active
  on public.channel_capability_catalog(domain, is_active);
create index if not exists idx_channel_role_caps_role
  on public.channel_role_capabilities(role);
create index if not exists idx_channel_capability_overrides_channel
  on public.channel_capability_overrides(channel_id, updated_at desc);

alter table public.channel_capability_catalog enable row level security;
alter table public.channel_role_capabilities enable row level security;
alter table public.channel_capability_overrides enable row level security;

drop policy if exists "capability_catalog_read_all" on public.channel_capability_catalog;
create policy "capability_catalog_read_all"
on public.channel_capability_catalog
for select
using (true);

drop policy if exists "role_caps_read_authenticated" on public.channel_role_capabilities;
create policy "role_caps_read_authenticated"
on public.channel_role_capabilities
for select
to authenticated
using (true);

drop policy if exists "channel_overrides_select_for_members" on public.channel_capability_overrides;
create policy "channel_overrides_select_for_members"
on public.channel_capability_overrides
for select
to authenticated
using (public.is_channel_member(channel_id, auth.uid()));

drop policy if exists "channel_overrides_insert_for_admins" on public.channel_capability_overrides;
create policy "channel_overrides_insert_for_admins"
on public.channel_capability_overrides
for insert
to authenticated
with check (
  public.is_channel_admin(channel_id, auth.uid())
  and created_by = auth.uid()
);

drop policy if exists "channel_overrides_update_for_admins" on public.channel_capability_overrides;
create policy "channel_overrides_update_for_admins"
on public.channel_capability_overrides
for update
to authenticated
using (public.is_channel_admin(channel_id, auth.uid()))
with check (public.is_channel_admin(channel_id, auth.uid()));

drop policy if exists "channel_overrides_delete_for_admins" on public.channel_capability_overrides;
create policy "channel_overrides_delete_for_admins"
on public.channel_capability_overrides
for delete
to authenticated
using (public.is_channel_admin(channel_id, auth.uid()));

create or replace function public.set_channel_capability_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_channel_capability_catalog_updated_at on public.channel_capability_catalog;
create trigger trg_channel_capability_catalog_updated_at
before update on public.channel_capability_catalog
for each row execute function public.set_channel_capability_updated_at();

drop trigger if exists trg_channel_capability_overrides_updated_at on public.channel_capability_overrides;
create trigger trg_channel_capability_overrides_updated_at
before update on public.channel_capability_overrides
for each row execute function public.set_channel_capability_updated_at();

create or replace function public.channel_has_capability(
  _channel_id uuid,
  _user_id uuid,
  _capability_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with member_role as (
    select coalesce(cm.role, 'guest') as role
    from public.channel_members cm
    where cm.channel_id = _channel_id
      and cm.user_id = _user_id
    limit 1
  ),
  role_allow as (
    select coalesce((
      select crc.is_allowed
      from public.channel_role_capabilities crc
      where crc.role = coalesce((select role from member_role), 'guest')
        and crc.capability_key = _capability_key
      limit 1
    ), false) as allowed
  ),
  override_allow as (
    select cco.is_enabled as enabled
    from public.channel_capability_overrides cco
    where cco.channel_id = _channel_id
      and cco.capability_key = _capability_key
    limit 1
  )
  select
    case
      when exists(select 1 from override_allow) then (select enabled from override_allow)
      else (select allowed from role_allow)
    end;
$$;

grant execute on function public.channel_has_capability(uuid, uuid, text) to authenticated;

insert into public.channel_capability_catalog(key, domain, title, description, default_params)
values
  ('channel.posts.read', 'channel_posts', 'Read posts', 'View posts in channel', '{}'::jsonb),
  ('channel.posts.create', 'channel_posts', 'Create posts', 'Publish new posts/messages', '{}'::jsonb),
  ('channel.posts.delete', 'channel_posts', 'Delete posts', 'Delete channel posts', '{}'::jsonb),
  ('channel.comments.read', 'channel_comments', 'Read comments', 'Read comments under posts', '{}'::jsonb),
  ('channel.comments.moderate', 'channel_comments', 'Moderate comments', 'Delete/hide comments', '{}'::jsonb),
  ('channel.members.invite', 'channel_membership', 'Invite members', 'Create invite links and invite users', '{}'::jsonb),
  ('channel.members.manage', 'channel_membership', 'Manage members', 'Promote/demote/kick members', '{}'::jsonb),
  ('channel.analytics.read', 'channel_analytics', 'Read analytics', 'Access channel analytics dashboard', '{}'::jsonb),
  ('channel.settings.update', 'channel_core', 'Update settings', 'Update channel profile and settings', '{}'::jsonb),
  ('channel.links.manage', 'channel_links', 'Manage links', 'Manage public and invite links', '{}'::jsonb),
  ('channel.reactions.moderate', 'channel_reactions', 'Moderate reactions', 'Filter and moderate reactions', '{}'::jsonb),
  ('channel.ads.manage', 'channel_advertising', 'Manage ads', 'Manage sponsored and ad placements', '{}'::jsonb)
on conflict (key) do update set
  domain = excluded.domain,
  title = excluded.title,
  description = excluded.description,
  default_params = excluded.default_params,
  is_active = true,
  updated_at = now();

insert into public.channel_role_capabilities(role, capability_key, is_allowed)
select 'owner', c.key, true
from public.channel_capability_catalog c
on conflict (role, capability_key) do update set is_allowed = excluded.is_allowed;

insert into public.channel_role_capabilities(role, capability_key, is_allowed)
values
  ('admin', 'channel.posts.read', true),
  ('admin', 'channel.posts.create', true),
  ('admin', 'channel.posts.delete', true),
  ('admin', 'channel.comments.read', true),
  ('admin', 'channel.comments.moderate', true),
  ('admin', 'channel.members.invite', true),
  ('admin', 'channel.members.manage', true),
  ('admin', 'channel.analytics.read', true),
  ('admin', 'channel.settings.update', true),
  ('admin', 'channel.links.manage', true),
  ('admin', 'channel.reactions.moderate', true),
  ('admin', 'channel.ads.manage', true),
  ('member', 'channel.posts.read', true),
  ('member', 'channel.comments.read', true),
  ('member', 'channel.posts.create', false),
  ('member', 'channel.comments.moderate', false),
  ('member', 'channel.members.invite', false),
  ('member', 'channel.members.manage', false),
  ('member', 'channel.analytics.read', false),
  ('member', 'channel.settings.update', false),
  ('member', 'channel.links.manage', false),
  ('member', 'channel.reactions.moderate', false),
  ('member', 'channel.ads.manage', false),
  ('guest', 'channel.posts.read', true),
  ('guest', 'channel.comments.read', false),
  ('guest', 'channel.posts.create', false),
  ('guest', 'channel.comments.moderate', false),
  ('guest', 'channel.members.invite', false),
  ('guest', 'channel.members.manage', false),
  ('guest', 'channel.analytics.read', false),
  ('guest', 'channel.settings.update', false),
  ('guest', 'channel.links.manage', false),
  ('guest', 'channel.reactions.moderate', false),
  ('guest', 'channel.ads.manage', false)
on conflict (role, capability_key) do update set is_allowed = excluded.is_allowed;

