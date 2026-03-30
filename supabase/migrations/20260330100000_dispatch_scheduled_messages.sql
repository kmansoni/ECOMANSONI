-- ============================================================================
-- dispatch_scheduled_messages()
-- Reads scheduled_messages WHERE status='scheduled' AND scheduled_for <= now(),
-- inserts each row into the messages table, then marks status='sent'.
-- Invoked by pg_cron every minute.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.dispatch_scheduled_messages()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row   public.scheduled_messages%ROWTYPE;
  v_count INTEGER := 0;
BEGIN
  FOR v_row IN
    SELECT *
    FROM public.scheduled_messages
    WHERE status = 'scheduled'
      AND scheduled_for <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Insert into messages so real-time listeners pick it up
    INSERT INTO public.messages (
      conversation_id,
      sender_id,
      content,
      media_url,
      media_type,
      reply_to_message_id,
      thread_root_message_id,
      created_at
    ) VALUES (
      v_row.conversation_id,
      v_row.user_id,
      v_row.content,
      v_row.media_url,
      v_row.media_type,
      v_row.reply_to_message_id,
      v_row.thread_root_message_id,
      now()
    );

    -- Mark as sent
    UPDATE public.scheduled_messages
    SET status = 'sent'
    WHERE id = v_row.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Revoke from public / anon; only service_role (pg_cron) should call it.
REVOKE ALL ON FUNCTION public.dispatch_scheduled_messages() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_scheduled_messages() FROM anon;
REVOKE ALL ON FUNCTION public.dispatch_scheduled_messages() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_scheduled_messages() TO service_role;

COMMENT ON FUNCTION public.dispatch_scheduled_messages() IS
  'Dispatches due scheduled_messages into messages table. Called by pg_cron every minute.';

-- ============================================================================
-- pg_cron job — fires every minute
-- (pg_cron must be enabled in the Supabase project extensions)
-- ============================================================================
SELECT cron.schedule(
  'dispatch-scheduled-messages',   -- job name (idempotent)
  '* * * * *',                      -- every minute
  'SELECT public.dispatch_scheduled_messages()'
);
