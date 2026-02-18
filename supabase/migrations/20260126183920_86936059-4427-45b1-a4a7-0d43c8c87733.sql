-- Add shared_post_id column to messages table for sharing posts in chat
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS shared_post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL;

-- Add same column to group_chat_messages
ALTER TABLE public.group_chat_messages ADD COLUMN IF NOT EXISTS shared_post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL;

-- Add same column to channel_messages
ALTER TABLE public.channel_messages ADD COLUMN IF NOT EXISTS shared_post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL;