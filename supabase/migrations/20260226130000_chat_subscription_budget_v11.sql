begin;

create table if not exists public.chat_subscription_budget_config_v11 (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.chat_subscription_budget_config_v11(key, value)
values (
  'limits',
  jsonb_build_object(
    'active_per_device', 1,
    'background_per_device', 3,
    'total_per_device', 10,
    'background_ttl_seconds', 1200
  )
)
on conflict (key) do nothing;

create table if not exists public.chat_device_subscriptions_v11 (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  dialog_id uuid not null references public.conversations(id) on delete cascade,
  mode text not null check (mode in ('active', 'background')),
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id, dialog_id)
);

create index if not exists idx_chat_device_subscriptions_v11_user_device_mode
  on public.chat_device_subscriptions_v11(user_id, device_id, mode, updated_at desc);

alter table public.chat_device_subscriptions_v11 enable row level security;

drop policy if exists chat_device_subscriptions_v11_owner_select on public.chat_device_subscriptions_v11;
create policy chat_device_subscriptions_v11_owner_select
on public.chat_device_subscriptions_v11
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.chat_subscription_ttl_sweep_v11(
  p_user_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg jsonb;
  v_bg_ttl integer;
  v_now timestamptz := now();
  v_rows integer := 0;
begin
  select value into v_cfg
  from public.chat_subscription_budget_config_v11
  where key = 'limits';

  v_bg_ttl := coalesce((v_cfg->>'background_ttl_seconds')::integer, 1200);

  if p_user_id is null then
    with deleted as (
      delete from public.chat_device_subscriptions_v11
      where mode = 'background'
        and updated_at < (v_now - make_interval(secs => v_bg_ttl))
      returning 1
    )
    select count(*) into v_rows from deleted;
  else
    with deleted as (
      delete from public.chat_device_subscriptions_v11
      where user_id = p_user_id
        and mode = 'background'
        and updated_at < (v_now - make_interval(secs => v_bg_ttl))
      returning 1
    )
    select count(*) into v_rows from deleted;
  end if;

  return v_rows;
end;
$$;

create or replace function public.chat_set_subscription_mode_v11(
  p_device_id text,
  p_dialog_id uuid,
  p_mode text
)
returns table(
  ok boolean,
  applied_mode text,
  active_count integer,
  background_count integer,
  total_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_cfg jsonb;
  v_active_limit integer;
  v_bg_limit integer;
  v_total_limit integer;
  v_now timestamptz := now();
  v_existing_mode text;
begin
  if v_user is null then
    raise exception 'ERR_UNAUTHORIZED';
  end if;

  if p_device_id is null or btrim(p_device_id) = '' then
    raise exception 'ERR_INVALID_DEVICE';
  end if;

  if p_mode not in ('active', 'background', 'off') then
    raise exception 'ERR_INVALID_MODE';
  end if;

  if p_mode <> 'off' then
    if not exists (
      select 1
      from public.conversation_participants cp
      where cp.conversation_id = p_dialog_id
        and cp.user_id = v_user
    ) then
      raise exception 'ERR_FORBIDDEN';
    end if;
  end if;

  perform public.chat_subscription_ttl_sweep_v11(v_user);

  select value into v_cfg
  from public.chat_subscription_budget_config_v11
  where key = 'limits';

  v_active_limit := coalesce((v_cfg->>'active_per_device')::integer, 1);
  v_bg_limit := coalesce((v_cfg->>'background_per_device')::integer, 3);
  v_total_limit := coalesce((v_cfg->>'total_per_device')::integer, 10);

  select mode into v_existing_mode
  from public.chat_device_subscriptions_v11
  where user_id = v_user
    and device_id = p_device_id
    and dialog_id = p_dialog_id;

  if p_mode = 'off' then
    delete from public.chat_device_subscriptions_v11
    where user_id = v_user
      and device_id = p_device_id
      and dialog_id = p_dialog_id;
  else
    if p_mode = 'active' then
      update public.chat_device_subscriptions_v11
      set mode = 'background',
          updated_at = v_now
      where user_id = v_user
        and device_id = p_device_id
        and mode = 'active'
        and dialog_id <> p_dialog_id;
    end if;

    insert into public.chat_device_subscriptions_v11(user_id, device_id, dialog_id, mode, updated_at)
    values (v_user, p_device_id, p_dialog_id, p_mode, v_now)
    on conflict (user_id, device_id, dialog_id)
    do update set
      mode = excluded.mode,
      updated_at = excluded.updated_at;

    while (
      select count(*)
      from public.chat_device_subscriptions_v11 s
      where s.user_id = v_user
        and s.device_id = p_device_id
        and s.mode = 'background'
    ) > v_bg_limit
    loop
      delete from public.chat_device_subscriptions_v11
      where ctid in (
        select ctid
        from public.chat_device_subscriptions_v11 s
        where s.user_id = v_user
          and s.device_id = p_device_id
          and s.mode = 'background'
        order by s.updated_at asc
        limit 1
      );
    end loop;

    while (
      select count(*)
      from public.chat_device_subscriptions_v11 s
      where s.user_id = v_user
        and s.device_id = p_device_id
        and s.mode = 'active'
    ) > v_active_limit
    loop
      update public.chat_device_subscriptions_v11
      set mode = 'background',
          updated_at = v_now
      where ctid in (
        select ctid
        from public.chat_device_subscriptions_v11 s
        where s.user_id = v_user
          and s.device_id = p_device_id
          and s.mode = 'active'
        order by s.updated_at asc
        limit 1
      );
    end loop;

    while (
      select count(*)
      from public.chat_device_subscriptions_v11 s
      where s.user_id = v_user
        and s.device_id = p_device_id
    ) > v_total_limit
    loop
      delete from public.chat_device_subscriptions_v11
      where ctid in (
        select ctid
        from public.chat_device_subscriptions_v11 s
        where s.user_id = v_user
          and s.device_id = p_device_id
        order by
          case when s.mode = 'active' then 1 else 0 end asc,
          s.updated_at asc
        limit 1
      );
    end loop;
  end if;

  return query
  select
    true,
    coalesce((
      select s.mode
      from public.chat_device_subscriptions_v11 s
      where s.user_id = v_user
        and s.device_id = p_device_id
        and s.dialog_id = p_dialog_id
      limit 1
    ), 'off') as applied_mode,
    (
      select count(*)::integer
      from public.chat_device_subscriptions_v11 s
      where s.user_id = v_user
        and s.device_id = p_device_id
        and s.mode = 'active'
    ) as active_count,
    (
      select count(*)::integer
      from public.chat_device_subscriptions_v11 s
      where s.user_id = v_user
        and s.device_id = p_device_id
        and s.mode = 'background'
    ) as background_count,
    (
      select count(*)::integer
      from public.chat_device_subscriptions_v11 s
      where s.user_id = v_user
        and s.device_id = p_device_id
    ) as total_count;
end;
$$;

grant execute on function public.chat_subscription_ttl_sweep_v11(uuid) to authenticated;
grant execute on function public.chat_set_subscription_mode_v11(text, uuid, text) to authenticated;

commit;
