-- Add shared_reel_id column to messages table for DMs
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS shared_reel_id UUID REFERENCES public.reels(id) ON DELETE SET NULL;

-- Add shared_reel_id column to group_chat_messages table
ALTER TABLE public.group_chat_messages 
ADD COLUMN IF NOT EXISTS shared_reel_id UUID REFERENCES public.reels(id) ON DELETE SET NULL;

-- Add shared_reel_id column to channel_messages table
ALTER TABLE public.channel_messages 
ADD COLUMN IF NOT EXISTS shared_reel_id UUID REFERENCES public.reels(id) ON DELETE SET NULL;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_messages_shared_reel_id ON public.messages(shared_reel_id) WHERE shared_reel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_group_chat_messages_shared_reel_id ON public.group_chat_messages(shared_reel_id) WHERE shared_reel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_channel_messages_shared_reel_id ON public.channel_messages(shared_reel_id) WHERE shared_reel_id IS NOT NULL;