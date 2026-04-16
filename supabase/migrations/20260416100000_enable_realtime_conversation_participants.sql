-- conversation_participants не была добавлена в supabase_realtime publication.
-- Из-за этого Realtime-подписка на изменения участников в useConversations()
-- молча не доставляла события — список чатов обновлялся только поллингом (3-7с).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
