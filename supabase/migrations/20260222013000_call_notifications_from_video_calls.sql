-- Auto-enqueue incoming call notification events from video_calls lifecycle.

CREATE OR REPLACE FUNCTION public.enqueue_video_call_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now_ms BIGINT := FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000);
  v_expires_ms BIGINT := FLOOR(EXTRACT(EPOCH FROM (NOW() + INTERVAL '35 seconds')) * 1000);
  v_chat_id TEXT;
BEGIN
  v_chat_id := COALESCE(NEW.conversation_id::TEXT, NEW.id::TEXT);

  IF TG_OP = 'INSERT' AND NEW.status = 'ringing' THEN
    INSERT INTO public.notification_events (
      type,
      status,
      user_id,
      payload,
      priority,
      collapse_key,
      dedup_key,
      ttl_seconds,
      max_attempts
    )
    VALUES (
      'incoming_call',
      'pending',
      NEW.callee_id,
      jsonb_build_object(
        'v', 1,
        'kind', 'incoming_call',
        'callId', NEW.id::TEXT,
        'roomId', NEW.id::TEXT,
        'callerId', NEW.caller_id::TEXT,
        'calleeId', NEW.callee_id::TEXT,
        'media', NEW.call_type,
        'createdAtMs', v_now_ms,
        'expiresAtMs', v_expires_ms,
        'security', jsonb_build_object('tokenHint', 'supabase_jwt'),
        'deeplink', jsonb_build_object(
          'path', '/call',
          'params', jsonb_build_object('callId', NEW.id::TEXT)
        )
      ),
      9,
      NEW.id::TEXT,
      NEW.id::TEXT,
      40,
      3
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('answered', 'declined', 'ended', 'missed') THEN
    -- Notify caller about terminal/accept state so native shell can sync badges/state.
    INSERT INTO public.notification_events (
      type,
      status,
      user_id,
      payload,
      priority,
      collapse_key,
      dedup_key,
      ttl_seconds,
      max_attempts
    )
    VALUES (
      'message',
      'pending',
      NEW.caller_id,
      jsonb_build_object(
        'v', 1,
        'kind', 'message',
        'messageId', CONCAT('call:', NEW.id::TEXT, ':', NEW.status),
        'chatId', v_chat_id,
        'senderId', NEW.callee_id::TEXT,
        'preview', jsonb_build_object(
          'title', 'Call update',
          'body', CONCAT('Call status: ', NEW.status)
        ),
        'deeplink', jsonb_build_object(
          'path', '/call',
          'params', jsonb_build_object('callId', NEW.id::TEXT)
        )
      ),
      7,
      NEW.id::TEXT,
      CONCAT(NEW.id::TEXT, ':', NEW.status),
      120,
      3
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_video_calls_enqueue_notifications ON public.video_calls;
CREATE TRIGGER trg_video_calls_enqueue_notifications
AFTER INSERT OR UPDATE OF status
ON public.video_calls
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_video_call_notifications();
