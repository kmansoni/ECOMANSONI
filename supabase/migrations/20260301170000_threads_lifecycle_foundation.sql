-- Stage 1 / Threads foundation:
-- Adds explicit lifecycle registry for message threads over existing messages.thread_root_message_id model.

CREATE TABLE IF NOT EXISTS public.message_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  parent_message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  title text,
  is_locked boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  archive_at timestamptz,
  reply_count integer NOT NULL DEFAULT 0,
  participant_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_message_id)
);
CREATE INDEX IF NOT EXISTS idx_message_threads_conversation
  ON public.message_threads(conversation_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_threads_archived
  ON public.message_threads(conversation_id, is_archived, updated_at DESC);
ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "message_threads_select_participants" ON public.message_threads;
CREATE POLICY "message_threads_select_participants"
ON public.message_threads
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = message_threads.conversation_id
      AND cp.user_id = auth.uid()
  )
);
DROP POLICY IF EXISTS "message_threads_mutate_participants" ON public.message_threads;
CREATE POLICY "message_threads_mutate_participants"
ON public.message_threads
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = message_threads.conversation_id
      AND cp.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = message_threads.conversation_id
      AND cp.user_id = auth.uid()
  )
);
CREATE OR REPLACE FUNCTION public.message_threads_set_updated_at_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_message_threads_set_updated_at ON public.message_threads;
CREATE TRIGGER trg_message_threads_set_updated_at
BEFORE UPDATE ON public.message_threads
FOR EACH ROW
EXECUTE FUNCTION public.message_threads_set_updated_at_v1();
CREATE OR REPLACE FUNCTION public.message_threads_sync_reply_count_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _root_message_id uuid;
  _conversation_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.thread_root_message_id IS NULL THEN
      RETURN NEW;
    END IF;

    _root_message_id := NEW.thread_root_message_id;
    _conversation_id := NEW.conversation_id;

    INSERT INTO public.message_threads (conversation_id, parent_message_id, reply_count)
    VALUES (_conversation_id, _root_message_id, 1)
    ON CONFLICT (parent_message_id)
    DO UPDATE SET reply_count = GREATEST(0, public.message_threads.reply_count + 1),
                  updated_at = now();

    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.thread_root_message_id IS NULL THEN
      RETURN OLD;
    END IF;

    UPDATE public.message_threads mt
    SET reply_count = GREATEST(0, mt.reply_count - 1),
        updated_at = now()
    WHERE mt.parent_message_id = OLD.thread_root_message_id;

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_message_threads_reply_count_insert ON public.messages;
CREATE TRIGGER trg_message_threads_reply_count_insert
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.message_threads_sync_reply_count_v1();
DROP TRIGGER IF EXISTS trg_message_threads_reply_count_delete ON public.messages;
CREATE TRIGGER trg_message_threads_reply_count_delete
AFTER DELETE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.message_threads_sync_reply_count_v1();
CREATE OR REPLACE FUNCTION public.thread_set_lifecycle_v1(
  _conversation_id uuid,
  _parent_message_id uuid,
  _title text DEFAULT NULL,
  _is_archived boolean DEFAULT NULL,
  _is_locked boolean DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _thread_id uuid;
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF _conversation_id IS NULL OR _parent_message_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = _conversation_id
      AND cp.user_id = _actor_id
  ) THEN
    RAISE EXCEPTION 'not_participant' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.id = _parent_message_id
      AND m.conversation_id = _conversation_id
  ) THEN
    RAISE EXCEPTION 'invalid_parent_message' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.message_threads (
    conversation_id,
    parent_message_id,
    title,
    is_archived,
    is_locked,
    archive_at
  )
  VALUES (
    _conversation_id,
    _parent_message_id,
    NULLIF(btrim(COALESCE(_title, '')), ''),
    COALESCE(_is_archived, false),
    COALESCE(_is_locked, false),
    CASE WHEN COALESCE(_is_archived, false) THEN now() ELSE NULL END
  )
  ON CONFLICT (parent_message_id)
  DO UPDATE SET
    title = COALESCE(NULLIF(btrim(COALESCE(_title, '')), ''), public.message_threads.title),
    is_archived = COALESCE(_is_archived, public.message_threads.is_archived),
    is_locked = COALESCE(_is_locked, public.message_threads.is_locked),
    archive_at = CASE
      WHEN COALESCE(_is_archived, public.message_threads.is_archived) = true
        THEN COALESCE(public.message_threads.archive_at, now())
      ELSE NULL
    END,
    updated_at = now()
  RETURNING id INTO _thread_id;

  RETURN _thread_id;
END;
$$;
REVOKE ALL ON FUNCTION public.thread_set_lifecycle_v1(uuid, uuid, text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.thread_set_lifecycle_v1(uuid, uuid, text, boolean, boolean) TO authenticated;
