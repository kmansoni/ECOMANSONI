-- Stage 2 / Item #54 foundation: Message reminders + personal task hooks
-- Adds message_reminders table and guarded RPCs for create/complete/cancel lifecycle.

CREATE TABLE IF NOT EXISTS public.message_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  remind_at timestamptz NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, message_id, remind_at)
);
CREATE INDEX IF NOT EXISTS idx_message_reminders_user_status_time
  ON public.message_reminders(user_id, status, remind_at);
CREATE INDEX IF NOT EXISTS idx_message_reminders_conversation
  ON public.message_reminders(conversation_id, user_id, remind_at DESC);
ALTER TABLE public.message_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "message_reminders_select_own" ON public.message_reminders;
CREATE POLICY "message_reminders_select_own"
ON public.message_reminders
FOR SELECT
USING (user_id = auth.uid());
DROP POLICY IF EXISTS "message_reminders_insert_own" ON public.message_reminders;
CREATE POLICY "message_reminders_insert_own"
ON public.message_reminders
FOR INSERT
WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "message_reminders_update_own" ON public.message_reminders;
CREATE POLICY "message_reminders_update_own"
ON public.message_reminders
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.message_reminders_set_updated_at_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_message_reminders_set_updated_at ON public.message_reminders;
CREATE TRIGGER trg_message_reminders_set_updated_at
BEFORE UPDATE ON public.message_reminders
FOR EACH ROW
EXECUTE FUNCTION public.message_reminders_set_updated_at_v1();
CREATE OR REPLACE FUNCTION public.message_reminder_create_v1(
  _message_id uuid,
  _remind_at timestamptz,
  _note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _conversation_id uuid;
  _reminder_id uuid;
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF _message_id IS NULL OR _remind_at IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = '22023';
  END IF;

  IF _remind_at <= now() THEN
    RAISE EXCEPTION 'invalid_remind_at' USING ERRCODE = '22023';
  END IF;

  SELECT m.conversation_id
  INTO _conversation_id
  FROM public.messages m
  WHERE m.id = _message_id;

  IF _conversation_id IS NULL THEN
    RAISE EXCEPTION 'message_not_found' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = _conversation_id
      AND cp.user_id = _actor_id
  ) THEN
    RAISE EXCEPTION 'not_participant' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.message_reminders (
    user_id,
    message_id,
    conversation_id,
    remind_at,
    note,
    status
  )
  VALUES (
    _actor_id,
    _message_id,
    _conversation_id,
    _remind_at,
    NULLIF(btrim(COALESCE(_note, '')), ''),
    'pending'
  )
  ON CONFLICT (user_id, message_id, remind_at)
  DO UPDATE SET
    note = EXCLUDED.note,
    status = 'pending',
    completed_at = NULL,
    updated_at = now()
  RETURNING id INTO _reminder_id;

  RETURN _reminder_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.message_reminder_complete_v1(
  _reminder_id uuid
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

  IF _reminder_id IS NULL THEN
    RAISE EXCEPTION 'invalid_reminder_id' USING ERRCODE = '22023';
  END IF;

  UPDATE public.message_reminders mr
  SET status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE mr.id = _reminder_id
    AND mr.user_id = _actor_id
    AND mr.status <> 'cancelled';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reminder_not_found' USING ERRCODE = '22023';
  END IF;

  RETURN true;
END;
$$;
CREATE OR REPLACE FUNCTION public.message_reminder_cancel_v1(
  _reminder_id uuid
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

  IF _reminder_id IS NULL THEN
    RAISE EXCEPTION 'invalid_reminder_id' USING ERRCODE = '22023';
  END IF;

  UPDATE public.message_reminders mr
  SET status = 'cancelled',
      updated_at = now()
  WHERE mr.id = _reminder_id
    AND mr.user_id = _actor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reminder_not_found' USING ERRCODE = '22023';
  END IF;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.message_reminder_create_v1(uuid, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.message_reminder_complete_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.message_reminder_cancel_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.message_reminder_create_v1(uuid, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.message_reminder_complete_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.message_reminder_cancel_v1(uuid) TO authenticated;
