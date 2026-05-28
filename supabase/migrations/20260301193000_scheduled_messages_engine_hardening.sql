-- Stage 2 / Item #53 hardening: Scheduled messages reliable execution engine
-- Adds guarded RPCs for create/cancel and a due-processor with retry/error tracking.

ALTER TABLE public.scheduled_messages
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS sent_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due_status
  ON public.scheduled_messages(status, scheduled_for)
  WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_sent_message
  ON public.scheduled_messages(sent_message_id)
  WHERE sent_message_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.scheduled_messages_set_updated_at_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_scheduled_messages_set_updated_at ON public.scheduled_messages;
CREATE TRIGGER trg_scheduled_messages_set_updated_at
BEFORE UPDATE ON public.scheduled_messages
FOR EACH ROW
EXECUTE FUNCTION public.scheduled_messages_set_updated_at_v1();
CREATE OR REPLACE FUNCTION public.scheduled_message_create_v1(
  _conversation_id uuid,
  _content text,
  _scheduled_for timestamptz,
  _media_url text DEFAULT NULL,
  _media_type text DEFAULT NULL,
  _duration_seconds integer DEFAULT NULL,
  _reply_to_message_id uuid DEFAULT NULL,
  _thread_root_message_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _scheduled_id uuid;
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF _conversation_id IS NULL THEN
    RAISE EXCEPTION 'invalid_conversation_id' USING ERRCODE = '22023';
  END IF;

  IF _scheduled_for IS NULL OR _scheduled_for <= now() THEN
    RAISE EXCEPTION 'invalid_scheduled_for' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(btrim(_content), '') = '' THEN
    RAISE EXCEPTION 'empty_content' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = _conversation_id
      AND cp.user_id = _actor_id
  ) THEN
    RAISE EXCEPTION 'not_participant' USING ERRCODE = '42501';
  END IF;

  IF _reply_to_message_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.messages m
      WHERE m.id = _reply_to_message_id
        AND m.conversation_id = _conversation_id
    ) THEN
      RAISE EXCEPTION 'invalid_reply_to_message_id' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF _thread_root_message_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.messages m
      WHERE m.id = _thread_root_message_id
        AND m.conversation_id = _conversation_id
    ) THEN
      RAISE EXCEPTION 'invalid_thread_root_message_id' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.scheduled_messages (
    user_id,
    conversation_id,
    content,
    media_url,
    media_type,
    duration_seconds,
    scheduled_for,
    status,
    reply_to_message_id,
    thread_root_message_id
  )
  VALUES (
    _actor_id,
    _conversation_id,
    btrim(_content),
    _media_url,
    NULLIF(btrim(COALESCE(_media_type, '')), ''),
    _duration_seconds,
    _scheduled_for,
    'scheduled',
    _reply_to_message_id,
    COALESCE(_thread_root_message_id, _reply_to_message_id)
  )
  RETURNING id INTO _scheduled_id;

  RETURN _scheduled_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.scheduled_message_cancel_v1(
  _scheduled_message_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _actor_id uuid := auth.uid();
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF _scheduled_message_id IS NULL THEN
    RAISE EXCEPTION 'invalid_scheduled_message_id' USING ERRCODE = '22023';
  END IF;

  UPDATE public.scheduled_messages sm
  SET status = 'cancelled',
      updated_at = now()
  WHERE sm.id = _scheduled_message_id
    AND sm.user_id = _actor_id
    AND sm.status = 'scheduled';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'scheduled_message_not_found' USING ERRCODE = '22023';
  END IF;

  RETURN true;
END;
$$;
CREATE OR REPLACE FUNCTION public.scheduled_messages_process_due_v1(
  _limit integer DEFAULT 100,
  _max_attempts integer DEFAULT 5
)
RETURNS TABLE (
  processed integer,
  sent integer,
  failed integer,
  skipped integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _row public.scheduled_messages%ROWTYPE;
  _message_id uuid;
  _payload jsonb;
BEGIN
  IF _limit IS NULL OR _limit < 1 THEN
    _limit := 100;
  END IF;

  IF _max_attempts IS NULL OR _max_attempts < 1 THEN
    _max_attempts := 5;
  END IF;

  processed := 0;
  sent := 0;
  failed := 0;
  skipped := 0;

  FOR _row IN
    SELECT *
    FROM public.scheduled_messages sm
    WHERE sm.status = 'scheduled'
      AND sm.scheduled_for <= now()
      AND sm.attempt_count < _max_attempts
    ORDER BY sm.scheduled_for ASC
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  LOOP
    processed := processed + 1;

    UPDATE public.scheduled_messages
    SET attempt_count = attempt_count + 1,
        last_attempt_at = now(),
        updated_at = now()
    WHERE id = _row.id;

    IF NOT EXISTS (
      SELECT 1
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = _row.conversation_id
        AND cp.user_id = _row.user_id
    ) THEN
      UPDATE public.scheduled_messages
      SET status = 'failed',
          last_error = 'not_participant',
          updated_at = now()
      WHERE id = _row.id;
      failed := failed + 1;
      CONTINUE;
    END IF;

    BEGIN
      _payload := jsonb_build_object(
        'kind',
        CASE WHEN _row.media_url IS NULL THEN 'text' ELSE 'media' END,
        'text', _row.content,
        'media_url', _row.media_url,
        'media_type', _row.media_type,
        'duration_seconds', _row.duration_seconds,
        'reply_to_message_id', _row.reply_to_message_id,
        'thread_root_message_id', _row.thread_root_message_id
      );

      PERFORM set_config('request.jwt.claim.sub', _row.user_id::text, true);

      SELECT t.message_id
      INTO _message_id
      FROM public.send_message_v1(
        _row.conversation_id,
        gen_random_uuid(),
        _payload::text
      ) AS t
      LIMIT 1;

      IF _message_id IS NULL THEN
        RAISE EXCEPTION 'scheduled_send_failed';
      END IF;

      UPDATE public.scheduled_messages
      SET status = 'sent',
          sent_message_id = _message_id,
          last_error = NULL,
          updated_at = now()
      WHERE id = _row.id;

      sent := sent + 1;
    EXCEPTION WHEN others THEN
      UPDATE public.scheduled_messages
      SET status = CASE
            WHEN attempt_count >= _max_attempts THEN 'failed'
            ELSE 'scheduled'
          END,
          last_error = left(SQLERRM, 500),
          updated_at = now()
      WHERE id = _row.id;

      IF (SELECT status FROM public.scheduled_messages WHERE id = _row.id) = 'failed' THEN
        failed := failed + 1;
      ELSE
        skipped := skipped + 1;
      END IF;
    END;
  END LOOP;

  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.scheduled_message_create_v1(uuid, text, timestamptz, text, text, integer, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.scheduled_message_cancel_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.scheduled_messages_process_due_v1(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scheduled_message_create_v1(uuid, text, timestamptz, text, text, integer, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.scheduled_message_cancel_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.scheduled_messages_process_due_v1(integer, integer) TO service_role;
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scheduled-messages-dispatch-v1') THEN
    PERFORM cron.schedule(
      'scheduled-messages-dispatch-v1',
      '* * * * *',
      'SELECT public.scheduled_messages_process_due_v1(200, 5)'
    );
  END IF;
EXCEPTION
  WHEN others THEN
    -- Non-fatal in environments where cron schema permissions are restricted.
    NULL;
END
$$;
