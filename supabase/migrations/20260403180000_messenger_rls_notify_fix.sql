-- =============================================================================
-- Миграция: исправление 3 проблем безопасности мессенджера
-- 1) voice_messages — открытый SELECT → ограничение по conversation_participants
-- 2) message_reactions — открытый SELECT → ограничение через JOIN messages
-- 3) Отсутствие trigger push-уведомлений для DM (таблица messages)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. voice_messages: заменяем открытую политику SELECT на проверку membership
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users read voice messages" ON public.voice_messages;

DO $$ BEGIN
  CREATE POLICY "Users read own conversation voice messages" ON public.voice_messages
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.conversation_participants cp
        WHERE cp.conversation_id = voice_messages.conversation_id
          AND cp.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. message_reactions: заменяем открытую политику SELECT на проверку через messages
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone reads reactions" ON public.message_reactions;

DO $$ BEGIN
  CREATE POLICY "Users read reactions in own conversations" ON public.message_reactions
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.messages m
        JOIN public.conversation_participants cp
          ON cp.conversation_id = m.conversation_id
        WHERE m.id = message_reactions.message_id
          AND cp.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Trigger push-уведомлений для DM (messages)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_enqueue_dm_notification_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r_recipient RECORD;
BEGIN
  IF NEW.is_silent = true THEN
    RETURN NEW;
  END IF;

  FOR r_recipient IN
    SELECT cp.user_id
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = NEW.conversation_id
      AND cp.user_id <> NEW.sender_id
  LOOP
    INSERT INTO public.notification_events (
      user_id,
      type,
      priority,
      ttl_seconds,
      collapse_key,
      dedup_key,
      payload
    ) VALUES (
      r_recipient.user_id,
      'message',
      5,
      3600,
      'chat:' || NEW.conversation_id,
      'msg:' || NEW.id,
      jsonb_build_object(
        'v', 1,
        'kind', 'message',
        'messageId', NEW.id::text,
        'chatId', NEW.conversation_id::text,
        'senderId', NEW.sender_id::text,
        'preview', jsonb_build_object(
          'title', '',
          'body', left(COALESCE(NEW.content, ''), 100),
          'hasMedia', (NEW.media_url IS NOT NULL)
        ),
        'deeplink', jsonb_build_object(
          'path', '/chat',
          'params', jsonb_build_object(
            'chatId', NEW.conversation_id::text,
            'messageId', NEW.id::text
          )
        )
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dm_message_notification_v1 ON public.messages;

CREATE TRIGGER trg_dm_message_notification_v1
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enqueue_dm_notification_v1();
