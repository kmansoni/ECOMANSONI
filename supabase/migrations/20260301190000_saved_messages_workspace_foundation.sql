-- Stage 2 / Item #55 foundation: Saved messages workspace (notes + tags)

CREATE TABLE IF NOT EXISTS public.saved_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  note text,
  tags text[] NOT NULL DEFAULT '{}',
  saved_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_saved_messages_user_saved_at
  ON public.saved_messages(user_id, saved_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_messages_conversation
  ON public.saved_messages(conversation_id, user_id, saved_at DESC);
ALTER TABLE public.saved_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saved_messages_select_own" ON public.saved_messages;
CREATE POLICY "saved_messages_select_own"
ON public.saved_messages
FOR SELECT
USING (user_id = auth.uid());
DROP POLICY IF EXISTS "saved_messages_insert_own" ON public.saved_messages;
CREATE POLICY "saved_messages_insert_own"
ON public.saved_messages
FOR INSERT
WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "saved_messages_update_own" ON public.saved_messages;
CREATE POLICY "saved_messages_update_own"
ON public.saved_messages
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "saved_messages_delete_own" ON public.saved_messages;
CREATE POLICY "saved_messages_delete_own"
ON public.saved_messages
FOR DELETE
USING (user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.saved_messages_set_updated_at_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_saved_messages_set_updated_at ON public.saved_messages;
CREATE TRIGGER trg_saved_messages_set_updated_at
BEFORE UPDATE ON public.saved_messages
FOR EACH ROW
EXECUTE FUNCTION public.saved_messages_set_updated_at_v1();
CREATE OR REPLACE FUNCTION public.message_save_v1(
  _message_id uuid,
  _note text DEFAULT NULL,
  _tags text[] DEFAULT '{}'::text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _conversation_id uuid;
  _saved_id uuid;
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF _message_id IS NULL THEN
    RAISE EXCEPTION 'invalid_message_id' USING ERRCODE = '22023';
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

  INSERT INTO public.saved_messages (
    user_id,
    message_id,
    conversation_id,
    note,
    tags
  )
  VALUES (
    _actor_id,
    _message_id,
    _conversation_id,
    NULLIF(btrim(COALESCE(_note, '')), ''),
    COALESCE(_tags, '{}'::text[])
  )
  ON CONFLICT (user_id, message_id)
  DO UPDATE SET
    note = COALESCE(EXCLUDED.note, public.saved_messages.note),
    tags = COALESCE(EXCLUDED.tags, public.saved_messages.tags),
    updated_at = now()
  RETURNING id INTO _saved_id;

  RETURN _saved_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.message_unsave_v1(
  _message_id uuid
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

  IF _message_id IS NULL THEN
    RAISE EXCEPTION 'invalid_message_id' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.saved_messages sm
  WHERE sm.user_id = _actor_id
    AND sm.message_id = _message_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'saved_message_not_found' USING ERRCODE = '22023';
  END IF;

  RETURN true;
END;
$$;
CREATE OR REPLACE FUNCTION public.message_update_saved_v1(
  _saved_id uuid,
  _note text DEFAULT NULL,
  _tags text[] DEFAULT NULL
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

  IF _saved_id IS NULL THEN
    RAISE EXCEPTION 'invalid_saved_id' USING ERRCODE = '22023';
  END IF;

  UPDATE public.saved_messages sm
  SET note = COALESCE(NULLIF(btrim(COALESCE(_note, '')), ''), sm.note),
      tags = COALESCE(_tags, sm.tags),
      updated_at = now()
  WHERE sm.id = _saved_id
    AND sm.user_id = _actor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'saved_message_not_found' USING ERRCODE = '22023';
  END IF;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.message_save_v1(uuid, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.message_unsave_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.message_update_saved_v1(uuid, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.message_save_v1(uuid, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.message_unsave_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.message_update_saved_v1(uuid, text, text[]) TO authenticated;
