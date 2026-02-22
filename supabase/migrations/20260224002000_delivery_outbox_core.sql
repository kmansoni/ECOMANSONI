-- 20260224002000_delivery_outbox_core.sql
-- REQ-0131: Durable Delivery Outbox Worker Contract (P0)

create table if not exists public.delivery_outbox (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (topic in ('dialog','channel','call')),
  aggregate_id uuid not null,
  event_type text not null,
  payload jsonb not null,

  state text not null default 'pending' check (state in ('pending','processing','done','dead')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_by text,
  locked_at timestamptz,
  last_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists delivery_outbox_pending_idx
  on public.delivery_outbox(state, next_attempt_at, created_at);

create index if not exists delivery_outbox_aggregate_idx
  on public.delivery_outbox(topic, aggregate_id, created_at desc);

create index if not exists delivery_outbox_created_idx
  on public.delivery_outbox(created_at desc);

create or replace function public.set_delivery_outbox_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_delivery_outbox_updated_at on public.delivery_outbox;
create trigger trg_delivery_outbox_updated_at
before update on public.delivery_outbox
for each row
execute function public.set_delivery_outbox_updated_at();

alter table public.delivery_outbox enable row level security;

-- No direct RLS policies: access via service-role RPC only.

create or replace function public.delivery_claim_batch_v1(
  p_worker_id text,
  p_limit integer default 50
)
returns table (
  id uuid,
  topic text,
  aggregate_id uuid,
  event_type text,
  payload jsonb,
  attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception 'invalid_worker_id' using errcode = '22023';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'invalid_limit' using errcode = '22023';
  end if;

  return query
  with candidate as (
    select o.id
    from public.delivery_outbox o
    where o.state = 'pending'
      and o.next_attempt_at <= now()
    order by o.created_at asc
    limit p_limit
    for update skip locked
  )
  update public.delivery_outbox o
     set state = 'processing',
         locked_by = p_worker_id,
         locked_at = now(),
         attempts = o.attempts + 1
    from candidate c
   where o.id = c.id
  returning o.id, o.topic, o.aggregate_id, o.event_type, o.payload, o.attempts;
end;
$$;

create or replace function public.delivery_mark_done_v1(
  p_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.delivery_outbox
     set state = 'done',
         locked_by = null,
         locked_at = null,
         last_error = null
   where id = p_id
     and state in ('processing', 'pending');
$$;

create or replace function public.delivery_mark_fail_v1(
  p_id uuid,
  p_error text,
  p_backoff_seconds integer default 10,
  p_max_attempts integer default 25
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.delivery_outbox
     set state = case when attempts >= greatest(p_max_attempts, 1) then 'dead' else 'pending' end,
         next_attempt_at = now() + make_interval(secs => greatest(coalesce(p_backoff_seconds, 1), 1)),
         locked_by = null,
         locked_at = null,
         last_error = left(coalesce(p_error, 'unknown_error'), 2000)
   where id = p_id
     and state in ('processing', 'pending');
$$;

revoke all on function public.delivery_claim_batch_v1(text, integer) from public;
revoke all on function public.delivery_mark_done_v1(uuid) from public;
revoke all on function public.delivery_mark_fail_v1(uuid, text, integer, integer) from public;

grant execute on function public.delivery_claim_batch_v1(text, integer) to service_role;
grant execute on function public.delivery_mark_done_v1(uuid) to service_role;
grant execute on function public.delivery_mark_fail_v1(uuid, text, integer, integer) to service_role;
