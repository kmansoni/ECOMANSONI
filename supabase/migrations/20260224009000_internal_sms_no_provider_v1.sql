-- Internal SMS-like messaging without external telecom providers.
-- This is in-app delivery only (DB + existing notification router).

CREATE TABLE IF NOT EXISTS public.internal_sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internal_sms_messages_sender_created
  ON public.internal_sms_messages(sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_internal_sms_messages_recipient_created
  ON public.internal_sms_messages(recipient_id, created_at DESC);

ALTER TABLE public.internal_sms_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "internal_sms_select_participants" ON public.internal_sms_messages;
CREATE POLICY "internal_sms_select_participants"
  ON public.internal_sms_messages
  FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "internal_sms_insert_sender_only" ON public.internal_sms_messages;
CREATE POLICY "internal_sms_insert_sender_only"
  ON public.internal_sms_messages
  FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "internal_sms_update_recipient" ON public.internal_sms_messages;
CREATE POLICY "internal_sms_update_recipient"
  ON public.internal_sms_messages
  FOR UPDATE
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

CREATE OR REPLACE FUNCTION public.send_internal_sms_v1(
  p_recipient_id UUID,
  p_body TEXT
)
RETURNS TABLE(message_id UUID, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id UUID := auth.uid();
  v_body TEXT := btrim(COALESCE(p_body, ''));
  v_message_id UUID;
  v_created_at TIMESTAMPTZ;
  v_preview TEXT;
BEGIN
  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  IF p_recipient_id IS NULL THEN
    RAISE EXCEPTION 'recipient_required';
  END IF;

  IF p_recipient_id = v_sender_id THEN
    RAISE EXCEPTION 'self_recipient_not_allowed';
  END IF;

  IF char_length(v_body) < 1 OR char_length(v_body) > 1000 THEN
    RAISE EXCEPTION 'invalid_body_length';
  END IF;

  INSERT INTO public.internal_sms_messages(sender_id, recipient_id, body)
  VALUES (v_sender_id, p_recipient_id, v_body)
  RETURNING id, internal_sms_messages.created_at
  INTO v_message_id, v_created_at;

  v_preview := CASE
    WHEN char_length(v_body) > 120 THEN left(v_body, 117) || '...'
    ELSE v_body
  END;

  BEGIN
    INSERT INTO public.notification_events(
      type,
      user_id,
      payload,
      priority,
      ttl_seconds,
      collapse_key,
      dedup_key
    )
    VALUES (
      'message',
      p_recipient_id,
      jsonb_build_object(
        'v', 1,
        'kind', 'internal_sms',
        'messageId', v_message_id,
        'senderId', v_sender_id,
        'recipientId', p_recipient_id,
        'preview', jsonb_build_object(
          'title', 'SMS',
          'body', v_preview
        ),
        'deeplink', jsonb_build_object(
          'path', '/chats',
          'params', jsonb_build_object('userId', v_sender_id, 'messageId', v_message_id)
        )
      ),
      5,
      3600,
      'internal_sms:' || p_recipient_id,
      'internal_sms:' || v_message_id
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Best effort notifications; message insertion must succeed regardless.
      NULL;
  END;

  RETURN QUERY SELECT v_message_id, v_created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.send_internal_sms_v1(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_internal_sms_v1(UUID, TEXT) TO authenticated;

