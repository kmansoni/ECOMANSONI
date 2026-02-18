-- Ensure conversations list can refresh in realtime when updated_at changes
-- 1) Trigger: when a new DM message arrives, bump conversation.updated_at
CREATE OR REPLACE FUNCTION public.bump_conversation_updated_at_from_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET updated_at = COALESCE(NEW.created_at, now())
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_conversation_updated_at_from_message ON public.messages;
CREATE TRIGGER trg_bump_conversation_updated_at_from_message
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.bump_conversation_updated_at_from_message();

-- 2) Realtime: make sure updates on conversations are broadcast
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;