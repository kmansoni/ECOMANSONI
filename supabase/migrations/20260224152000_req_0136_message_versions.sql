-- 20260224152000_req_0136_message_versions.sql
-- REQ-0136: Message Version Stream for Edit/Delete/Restore (P0)

-- Ensure messages table has updated_at column
alter table public.messages
  add column if not exists updated_at timestamptz;

-- Trigger for messages.updated_at
create or replace function public.set_messages_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_messages_updated_at on public.messages;
create trigger trg_messages_updated_at
before update on public.messages
for each row
execute function public.set_messages_updated_at();

-- Table: message_versions (edit/delete/restore history)
-- Stores all edits, deletes, and restores as ordered version events
create table if not exists public.message_versions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  edit_seq bigint not null,
  
  -- Tombstone delete: null body means deleted
  body text,
  edited_by uuid not null references auth.users(id) on delete cascade,
  edited_at timestamptz not null default now(),
  
  -- Operation type for clarity
  operation text not null check (operation in ('edit','delete','restore')),
  
  created_at timestamptz not null default now()
);

-- Unique constraint: one sequence per conversation (global monotonic)
create unique index if not exists message_versions_conversation_seq_uniq
  on public.message_versions(conversation_id, edit_seq);

-- Index for message history lookup
create index if not exists message_versions_message_idx
  on public.message_versions(message_id, edit_seq desc);

-- Index for audit/moderation queries
create index if not exists message_versions_edited_at_idx
  on public.message_versions(edited_at desc);

alter table public.message_versions enable row level security;

-- RLS: users can read versions of messages in conversations they participate in
create policy message_versions_select on public.message_versions
  for select using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = message_versions.conversation_id
        and cp.user_id = auth.uid()
    )
  );

-- Sequence generator for edit_seq (per conversation)
create or replace function public.next_edit_seq_v1(p_conversation_id uuid)
returns bigint
language sql
security definer
set search_path = public
as $$
  select coalesce(max(edit_seq), 0) + 1
  from public.message_versions
  where conversation_id = p_conversation_id;
$$;

-- RPC: message_edit_v1
-- Records edit as version event, preserves tombstone semantics
create or replace function public.message_edit_v1(
  p_message_id uuid,
  p_new_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_edit_seq bigint;
  v_version_id uuid;
begin
  -- Get conversation_id from message
  select conversation_id into v_conversation_id
  from public.messages
  where id = p_message_id and sender_id = auth.uid();

  if not found then
    raise exception 'message_not_found_or_forbidden' using errcode = '42P01';
  end if;

  -- Generate next edit sequence
  v_edit_seq := public.next_edit_seq_v1(v_conversation_id);

  -- Insert version record
  insert into public.message_versions (
    conversation_id, message_id, edit_seq, body, edited_by, operation
  ) values (
    v_conversation_id, p_message_id, v_edit_seq, p_new_body, auth.uid(), 'edit'
  ) returning id into v_version_id;

  -- Update current message content
  update public.messages
  set content = p_new_body, updated_at = now()
  where id = p_message_id;

  return jsonb_build_object(
    'version_id', v_version_id,
    'edit_seq', v_edit_seq,
    'edited_at', now()
  );
end;
$$;

-- RPC: message_delete_v1
-- Records delete as tombstone (null body)
create or replace function public.message_delete_v1(
  p_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_edit_seq bigint;
  v_version_id uuid;
begin
  select conversation_id into v_conversation_id
  from public.messages
  where id = p_message_id and sender_id = auth.uid();

  if not found then
    raise exception 'message_not_found_or_forbidden' using errcode = '42P01';
  end if;

  v_edit_seq := public.next_edit_seq_v1(v_conversation_id);

  insert into public.message_versions (
    conversation_id, message_id, edit_seq, body, edited_by, operation
  ) values (
    v_conversation_id, p_message_id, v_edit_seq, null, auth.uid(), 'delete'
  ) returning id into v_version_id;

  -- Mark message as deleted (tombstone)
  update public.messages
  set content = null, updated_at = now()
  where id = p_message_id;

  return jsonb_build_object(
    'version_id', v_version_id,
    'edit_seq', v_edit_seq,
    'deleted_at', now()
  );
end;
$$;

-- RPC: message_restore_v1
-- Restores message from latest non-null body in version history
create or replace function public.message_restore_v1(
  p_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_edit_seq bigint;
  v_version_id uuid;
  v_restored_body text;
begin
  select conversation_id into v_conversation_id
  from public.messages
  where id = p_message_id and sender_id = auth.uid();

  if not found then
    raise exception 'message_not_found_or_forbidden' using errcode = '42P01';
  end if;

  -- Find latest non-null body
  select body into v_restored_body
  from public.message_versions
  where message_id = p_message_id and body is not null
  order by edit_seq desc
  limit 1;

  if v_restored_body is null then
    raise exception 'no_version_to_restore' using errcode = '42P01';
  end if;

  v_edit_seq := public.next_edit_seq_v1(v_conversation_id);

  insert into public.message_versions (
    conversation_id, message_id, edit_seq, body, edited_by, operation
  ) values (
    v_conversation_id, p_message_id, v_edit_seq, v_restored_body, auth.uid(), 'restore'
  ) returning id into v_version_id;

  update public.messages
  set content = v_restored_body, updated_at = now()
  where id = p_message_id;

  return jsonb_build_object(
    'version_id', v_version_id,
    'edit_seq', v_edit_seq,
    'restored_body', v_restored_body,
    'restored_at', now()
  );
end;
$$;

-- Grant execute to authenticated users
grant execute on function public.next_edit_seq_v1(uuid) to authenticated;
grant execute on function public.message_edit_v1(uuid, text) to authenticated;
grant execute on function public.message_delete_v1(uuid) to authenticated;
grant execute on function public.message_restore_v1(uuid) to authenticated;
