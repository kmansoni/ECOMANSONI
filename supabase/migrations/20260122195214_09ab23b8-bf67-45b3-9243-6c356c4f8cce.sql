-- Performance + correctness indexes for chat/profile

-- Profiles: ensure upsert(onConflict user_id) is valid and fast
CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_uidx ON public.profiles (user_id);
CREATE INDEX IF NOT EXISTS profiles_display_name_idx ON public.profiles (display_name);

-- Conversations participants: prevent duplicates and speed membership checks
CREATE UNIQUE INDEX IF NOT EXISTS conversation_participants_conv_user_uidx
  ON public.conversation_participants (conversation_id, user_id);
CREATE INDEX IF NOT EXISTS conversation_participants_user_id_idx
  ON public.conversation_participants (user_id);
CREATE INDEX IF NOT EXISTS conversation_participants_conversation_id_idx
  ON public.conversation_participants (conversation_id);

-- Messages: speed loading messages by conversation
CREATE INDEX IF NOT EXISTS messages_conversation_created_at_idx
  ON public.messages (conversation_id, created_at);