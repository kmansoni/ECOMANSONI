-- Runtime compatibility shim for chat send path.
-- 1) Eliminate PostgREST overload ambiguity for send_message_v1.
-- 2) Keep legacy trigger/function paths safe if they still reference messages.author_id.

BEGIN;

-- Remove legacy 3-arg overload to avoid PGRST203 ambiguity in REST RPC resolver.
DROP FUNCTION IF EXISTS public.send_message_v1(UUID, UUID, TEXT);

-- Ensure newer 4-arg signature remains executable for clients.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'send_message_v1'
      AND p.pronargs = 4
  ) THEN
    REVOKE ALL ON FUNCTION public.send_message_v1(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.send_message_v1(UUID, UUID, TEXT, BOOLEAN) TO authenticated;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Compatibility column for legacy trigger/function code that may read NEW.author_id.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS author_id UUID;

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
    RAISE EXCEPTION 'chat_runtime_compat_preflight_failed: found % duplicate (conversation_id, client_msg_id) keys in public.messages', v_dupe_count
      USING ERRCODE = '23505';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE UNIQUE INDEX IF NOT EXISTS messages_conversation_client_msg_id_uidx
  ON public.messages (conversation_id, client_msg_id)
  WHERE client_msg_id IS NOT NULL;

UPDATE public.messages
SET author_id = sender_id
WHERE author_id IS NULL
  AND sender_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.messages_fill_author_id_compat_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.author_id := COALESCE(NEW.author_id, NEW.sender_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_fill_author_id_compat_v1 ON public.messages;

CREATE TRIGGER trg_messages_fill_author_id_compat_v1
BEFORE INSERT OR UPDATE OF sender_id, author_id ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.messages_fill_author_id_compat_v1();

COMMIT;
