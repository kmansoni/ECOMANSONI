-- Telegram-like pinned messages for channels and chats.
-- One active pinned message per thread.

CREATE TABLE IF NOT EXISTS public.channel_pins (
  channel_id UUID PRIMARY KEY REFERENCES public.channels(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.channel_messages(id) ON DELETE CASCADE,
  pinned_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  silent BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.conversation_pins (
  conversation_id UUID PRIMARY KEY REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  pinned_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  silent BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_channel_pins_message_id ON public.channel_pins(message_id);
CREATE INDEX IF NOT EXISTS idx_conversation_pins_message_id ON public.conversation_pins(message_id);

ALTER TABLE public.channel_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_pins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.ensure_channel_pin_message_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.channel_messages m
    WHERE m.id = NEW.message_id
      AND m.channel_id = NEW.channel_id
  ) THEN
    RAISE EXCEPTION 'PIN_MESSAGE_CHANNEL_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_conversation_pin_message_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.id = NEW.message_id
      AND m.conversation_id = NEW.conversation_id
  ) THEN
    RAISE EXCEPTION 'PIN_MESSAGE_CONVERSATION_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_channel_pins_match ON public.channel_pins;
CREATE TRIGGER trg_channel_pins_match
BEFORE INSERT OR UPDATE ON public.channel_pins
FOR EACH ROW
EXECUTE FUNCTION public.ensure_channel_pin_message_match();

DROP TRIGGER IF EXISTS trg_conversation_pins_match ON public.conversation_pins;
CREATE TRIGGER trg_conversation_pins_match
BEFORE INSERT OR UPDATE ON public.conversation_pins
FOR EACH ROW
EXECUTE FUNCTION public.ensure_conversation_pin_message_match();

-- Channel pins: visible to channel viewers.
DROP POLICY IF EXISTS "channel_pins_read_public_or_member" ON public.channel_pins;
CREATE POLICY "channel_pins_read_public_or_member"
ON public.channel_pins FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = channel_pins.channel_id
      AND c.is_public = true
  )
  OR EXISTS (
    SELECT 1 FROM public.channel_members cm
    WHERE cm.channel_id = channel_pins.channel_id
      AND cm.user_id = auth.uid()
  )
);

-- Channel pins: owner/admin only.
DROP POLICY IF EXISTS "channel_pins_write_admin_owner" ON public.channel_pins;
CREATE POLICY "channel_pins_write_admin_owner"
ON public.channel_pins FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = channel_pins.channel_id
      AND c.owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.channel_members cm
    WHERE cm.channel_id = channel_pins.channel_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  pinned_by = auth.uid()
  AND (
    EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_pins.channel_id
        AND c.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.channel_members cm
      WHERE cm.channel_id = channel_pins.channel_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  )
);

-- Conversation pins: visible/writable for participants.
DROP POLICY IF EXISTS "conversation_pins_read_participants" ON public.conversation_pins;
CREATE POLICY "conversation_pins_read_participants"
ON public.conversation_pins FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversation_pins.conversation_id
      AND cp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "conversation_pins_write_participants" ON public.conversation_pins;
CREATE POLICY "conversation_pins_write_participants"
ON public.conversation_pins FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversation_pins.conversation_id
      AND cp.user_id = auth.uid()
  )
)
WITH CHECK (
  pinned_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversation_pins.conversation_id
      AND cp.user_id = auth.uid()
  )
);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_pins;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_pins;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

