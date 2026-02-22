-- Telegram-like channel settings v1
-- - Per-channel auto-delete timer (applies to new channel messages)
-- - Per-user notification preferences for channels
-- - Enforce posting/deleting via channel capability engine
-- - Hide expired messages at RLS layer

-- 1) Channel: auto-delete timer (seconds; 0 = never)
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS auto_delete_seconds INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'channels_auto_delete_seconds_check'
  ) THEN
    ALTER TABLE public.channels
      ADD CONSTRAINT channels_auto_delete_seconds_check
      CHECK (auto_delete_seconds >= 0 AND auto_delete_seconds <= 31536000);
  END IF;
END
$$;

-- 2) Channel messages: expires_at + trigger to set from channel setting
ALTER TABLE public.channel_messages
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_channel_messages_channel_created
  ON public.channel_messages(channel_id, created_at);

CREATE INDEX IF NOT EXISTS idx_channel_messages_expires_at
  ON public.channel_messages(expires_at);

CREATE OR REPLACE FUNCTION public.set_channel_message_expires_at_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ttl INTEGER;
BEGIN
  -- Only compute on INSERT; keep existing value if explicitly set.
  IF TG_OP = 'INSERT' THEN
    SELECT c.auto_delete_seconds
    INTO v_ttl
    FROM public.channels c
    WHERE c.id = NEW.channel_id;

    IF COALESCE(v_ttl, 0) > 0 THEN
      NEW.expires_at := NEW.created_at + make_interval(secs => v_ttl);
    ELSE
      NEW.expires_at := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_channel_messages_expires_at_v1 ON public.channel_messages;
CREATE TRIGGER trg_channel_messages_expires_at_v1
BEFORE INSERT ON public.channel_messages
FOR EACH ROW EXECUTE FUNCTION public.set_channel_message_expires_at_v1();

REVOKE ALL ON FUNCTION public.set_channel_message_expires_at_v1() FROM PUBLIC;

-- 3) Per-user channel notification prefs
CREATE TABLE IF NOT EXISTS public.channel_user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,

  -- Simple first version: either enabled, or muted until a timestamp.
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  muted_until TIMESTAMPTZ NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

ALTER TABLE public.channel_user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "channel_user_settings_select_own" ON public.channel_user_settings;
CREATE POLICY "channel_user_settings_select_own"
ON public.channel_user_settings
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "channel_user_settings_upsert_own" ON public.channel_user_settings;
CREATE POLICY "channel_user_settings_upsert_own"
ON public.channel_user_settings
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "channel_user_settings_update_own" ON public.channel_user_settings;
CREATE POLICY "channel_user_settings_update_own"
ON public.channel_user_settings
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_channel_user_settings_updated_at_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_channel_user_settings_updated_at_v1 ON public.channel_user_settings;
CREATE TRIGGER trg_touch_channel_user_settings_updated_at_v1
BEFORE UPDATE ON public.channel_user_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_channel_user_settings_updated_at_v1();

-- 4) Align channel update policy with capability engine/admin role
-- NOTE: policies are additive; we drop known older ones by name and recreate.
DROP POLICY IF EXISTS "Channel owner can update their channel" ON public.channels;
DROP POLICY IF EXISTS "Channel admin can update channel" ON public.channels;

CREATE POLICY "Channel admin can update channel"
ON public.channels
FOR UPDATE
TO authenticated
USING (public.is_channel_admin(id, auth.uid()))
WITH CHECK (public.is_channel_admin(id, auth.uid()));

-- 5) Enforce channel_messages write permissions via channel capability engine
-- Drop older policies by name if present.
DROP POLICY IF EXISTS "Members can send messages to channels" ON public.channel_messages;
DROP POLICY IF EXISTS "Members can view messages in their channels" ON public.channel_messages;
DROP POLICY IF EXISTS "Anyone can view messages in public channels" ON public.channel_messages;

-- View: public channels (not expired)
CREATE POLICY "Anyone can view messages in public channels"
ON public.channel_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = channel_messages.channel_id
      AND c.is_public = true
  )
  AND (channel_messages.expires_at IS NULL OR channel_messages.expires_at > now())
);

-- View: members (not expired)
CREATE POLICY "Members can view messages in their channels"
ON public.channel_messages
FOR SELECT
USING (
  public.is_channel_member(channel_id, auth.uid())
  AND (channel_messages.expires_at IS NULL OR channel_messages.expires_at > now())
);

-- Insert: must be member + capability
CREATE POLICY "Members can send messages to channels"
ON public.channel_messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND public.is_channel_member(channel_id, auth.uid())
  AND public.channel_has_capability(channel_id, auth.uid(), 'channel.posts.create')
);

-- Delete: sender OR capability
DROP POLICY IF EXISTS "Channel posts delete" ON public.channel_messages;
CREATE POLICY "Channel posts delete"
ON public.channel_messages
FOR DELETE
TO authenticated
USING (
  sender_id = auth.uid()
  OR public.channel_has_capability(channel_id, auth.uid(), 'channel.posts.delete')
);
