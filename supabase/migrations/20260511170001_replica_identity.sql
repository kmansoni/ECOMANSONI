-- REPLICA IDENTITY fix для Realtime
ALTER TABLE public.messages REPLICA IDENTITY USING INDEX messages_pkey;
ALTER TABLE public.conversation_participants REPLICA IDENTITY USING INDEX conversation_participants_pkey;