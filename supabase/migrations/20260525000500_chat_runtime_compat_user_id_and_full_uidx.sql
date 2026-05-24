-- Runtime compatibility follow-up for chat idempotency.
-- 1) Keep legacy trigger/function code safe if it references messages.user_id.
-- 2) Replace partial dialog/client_msg_id index with full unique index so ON CONFLICT
--    inference is deterministic for chat_send_message_v11.

BEGIN;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS user_id UUID;

UPDATE public.messages
SET user_id = sender_id
WHERE user_id IS NULL
  AND sender_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.messages_fill_sender_compat_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.sender_id := COALESCE(NEW.sender_id, NEW.user_id, NEW.author_id);
  NEW.author_id := COALESCE(NEW.author_id, NEW.sender_id, NEW.user_id);
  NEW.user_id := COALESCE(NEW.user_id, NEW.sender_id, NEW.author_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_fill_author_id_compat_v1 ON public.messages;
DROP TRIGGER IF EXISTS trg_messages_fill_sender_compat_v1 ON public.messages;

CREATE TRIGGER trg_messages_fill_sender_compat_v1
BEFORE INSERT OR UPDATE OF sender_id, author_id, user_id ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.messages_fill_sender_compat_v1();

DO $$
DECLARE
  v_dupe_count BIGINT := 0;
BEGIN
  SELECT COUNT(*) INTO v_dupe_count
  FROM (
    SELECT m.conversation_id, m.client_msg_id
    FROM public.messages m
    WHERE m.client_msg_id IS NOT NULL
    GROUP BY m.conversation_id, m.client_msg_id
    HAVING COUNT(*) > 1
  ) d;

  IF v_dupe_count > 0 THEN
    RAISE EXCEPTION 'chat_runtime_compat_v2_preflight_failed: found % duplicate (conversation_id, client_msg_id) keys in public.messages', v_dupe_count
      USING ERRCODE = '23505';
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP INDEX IF EXISTS public.messages_conversation_client_msg_id_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS messages_conversation_client_msg_id_uidx
  ON public.messages (conversation_id, client_msg_id);

COMMIT;
