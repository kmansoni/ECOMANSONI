-- Channel posts: silent publish + media durations + notification fanout.

-- 1) Add columns used by the Telegram-like composer.
ALTER TABLE public.channel_messages
  ADD COLUMN IF NOT EXISTS silent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

CREATE INDEX IF NOT EXISTS idx_channel_messages_channel_created_v2
  ON public.channel_messages(channel_id, created_at);

-- 2) Enqueue notification events for channel posts (best-effort).
-- Notes:
-- - Uses notification_events (type='message') so the existing router can deliver.
-- - Respects per-user channel_user_settings: notifications_enabled + muted_until.
-- - Skips sender.

CREATE OR REPLACE FUNCTION public.enqueue_channel_post_notifications_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel_name TEXT;
  v_body TEXT;
BEGIN
  IF NEW.silent THEN
    RETURN NEW;
  END IF;

  SELECT c.name
    INTO v_channel_name
  FROM public.channels c
  WHERE c.id = NEW.channel_id;

  v_body := COALESCE(NULLIF(TRIM(NEW.content), ''), 'New post');
  IF LENGTH(v_body) > 120 THEN
    v_body := LEFT(v_body, 117) || '...';
  END IF;

  INSERT INTO public.notification_events(
    type,
    user_id,
    payload,
    priority,
    ttl_seconds,
    collapse_key,
    dedup_key
  )
  SELECT
    'message',
    cm.user_id,
    jsonb_build_object(
      'v', 1,
      'kind', 'channel_post',
      'messageId', NEW.id,
      'channelId', NEW.channel_id,
      'senderId', NEW.sender_id,
      'preview', jsonb_build_object(
        'title', COALESCE(v_channel_name, 'Channel'),
        'body', v_body,
        'hasMedia', (NEW.media_url IS NOT NULL)
      ),
      'deeplink', jsonb_build_object(
        'path', '/chats',
        'params', jsonb_build_object('channelId', NEW.channel_id, 'messageId', NEW.id)
      )
    ),
    5,
    3600,
    'channel:' || NEW.channel_id,
    'channel:' || NEW.channel_id || ':msg:' || NEW.id || ':user:' || cm.user_id
  FROM public.channel_members cm
  LEFT JOIN public.channel_user_settings cus
    ON cus.channel_id = NEW.channel_id
   AND cus.user_id = cm.user_id
  WHERE cm.channel_id = NEW.channel_id
    AND cm.user_id <> NEW.sender_id
    AND COALESCE(cus.notifications_enabled, TRUE) = TRUE
    AND (cus.muted_until IS NULL OR cus.muted_until <= NOW());

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Don't block publishing if notifications fail.
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_channel_post_notifications_v1 ON public.channel_messages;
CREATE TRIGGER trg_channel_post_notifications_v1
AFTER INSERT ON public.channel_messages
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_channel_post_notifications_v1();
