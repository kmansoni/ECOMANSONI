-- 20260224003000_internal_room_acl_v1.sql
-- REQ-0132: WebSocket Gateway Auth and Room ACL (service_role RPC)

create or replace function public.internal_can_join_room_v1(
  p_user_id uuid,
  p_room text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id_text text;
  v_id uuid;
begin
  if p_user_id is null then
    return false;
  end if;

  if p_room is null or length(trim(p_room)) = 0 then
    return false;
  end if;

  if p_room like 'user:%' then
    v_id_text := split_part(p_room, ':', 2);
    begin
      v_id := v_id_text::uuid;
    exception when others then
      return false;
    end;
    return v_id = p_user_id;
  end if;

  if p_room like 'dialog:%' then
    v_id_text := split_part(p_room, ':', 2);
    begin
      v_id := v_id_text::uuid;
    exception when others then
      return false;
    end;

    return exists (
      select 1
      from public.conversation_participants cp
      where cp.conversation_id = v_id
        and cp.user_id = p_user_id
    );
  end if;

  if p_room like 'channel:%' then
    v_id_text := split_part(p_room, ':', 2);
    begin
      v_id := v_id_text::uuid;
    exception when others then
      return false;
    end;

    if to_regproc('public.is_channel_member(uuid,uuid)') is not null then
      return public.is_channel_member(v_id, p_user_id);
    end if;

    return exists (
      select 1
      from public.channel_members cm
      where cm.channel_id = v_id
        and cm.user_id = p_user_id
    );
  end if;

  if p_room like 'call:%' then
    v_id_text := split_part(p_room, ':', 2);
    begin
      v_id := v_id_text::uuid;
    exception when others then
      return false;
    end;

    if to_regclass('public.video_calls') is not null then
      return exists (
        select 1
        from public.video_calls vc
        where vc.id = v_id
          and (vc.caller_id = p_user_id or vc.callee_id = p_user_id)
      );
    end if;

    if to_regclass('public.calls') is not null then
      return exists (
        select 1
        from public.calls c
        where c.id = v_id
          and (c.caller_id = p_user_id or c.callee_id = p_user_id)
      );
    end if;

    return false;
  end if;

  return false;
end;
$$;

revoke all on function public.internal_can_join_room_v1(uuid, text) from public;
grant execute on function public.internal_can_join_room_v1(uuid, text) to service_role;
