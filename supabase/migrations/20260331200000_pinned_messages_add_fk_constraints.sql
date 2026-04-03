-- Добавляем FK-ограничения к pinned_messages.
-- Без FK PostgREST не может разрешить join-синтаксис: messages(content, ...)
-- => PGRST200 «Could not find a relationship between pinned_messages and messages».

-- Удаляем orphaned строки (message_id без соответствующего messages.id)
DELETE FROM public.pinned_messages
WHERE message_id IS NOT NULL
  AND message_id NOT IN (SELECT id FROM public.messages);

-- Удаляем orphaned строки (conversation_id без соответствующего conversations.id)
DELETE FROM public.pinned_messages
WHERE conversation_id IS NOT NULL
  AND conversation_id NOT IN (SELECT id FROM public.conversations);

-- Удаляем orphaned строки (pinned_by без соответствующего auth.users.id)
DELETE FROM public.pinned_messages
WHERE pinned_by IS NOT NULL
  AND pinned_by NOT IN (SELECT id FROM auth.users);

-- FK: message_id → messages(id) ON DELETE CASCADE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_pinned_messages_message_id'
  ) THEN
    ALTER TABLE public.pinned_messages
      ADD CONSTRAINT fk_pinned_messages_message_id
      FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;
  END IF;
END $$;

-- FK: conversation_id → conversations(id) ON DELETE CASCADE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_pinned_messages_conversation_id'
  ) THEN
    ALTER TABLE public.pinned_messages
      ADD CONSTRAINT fk_pinned_messages_conversation_id
      FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- FK: pinned_by → auth.users(id) ON DELETE CASCADE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_pinned_messages_pinned_by'
  ) THEN
    ALTER TABLE public.pinned_messages
      ADD CONSTRAINT fk_pinned_messages_pinned_by
      FOREIGN KEY (pinned_by) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
