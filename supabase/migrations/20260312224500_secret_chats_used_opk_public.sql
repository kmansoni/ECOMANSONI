ALTER TABLE public.secret_chats
ADD COLUMN IF NOT EXISTS initiator_used_one_time_prekey_public text;