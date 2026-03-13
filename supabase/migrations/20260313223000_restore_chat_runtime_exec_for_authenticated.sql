-- Restore frontend/runtime EXECUTE permissions for chat and policy helper RPCs.
-- Critical hardening narrowed many SECURITY DEFINER functions to service_role only,
-- which breaks authenticated chat reads/writes and RLS policy evaluation paths.

begin;

do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (
        array[
          -- RLS helper functions used inside policies
          'get_user_conversation_ids',
          'is_group_member',
          'is_channel_member',

          -- Chat inbox/read paths
          'chat_get_inbox_v2',
          'chat_get_inbox_v11',
          'chat_get_inbox_v11_with_pointers',
          'chat_mark_read_v11',
          'chat_set_subscription_mode_v11',
          'chat_status_write_v11',
          'chat_resync_stream_v11',
          'chat_full_state_dialog_v11',
          'chat_schema_probe_v2',

          -- Core chat send/ack/runtime paths
          'chat_send_message_v11',
          'send_message_v1',
          'send_group_message_v1',
          'send_channel_message_v1',
          'ack_delivered_v1',
          'ack_read_v1',
          'get_or_create_dm',

          -- Group/channel creation paths used by authenticated clients
          'create_group_chat',
          'create_channel'
        ]
      )
  loop
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end
$$;

commit;
