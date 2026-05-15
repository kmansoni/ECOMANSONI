-- Add is_bot_chat column and bot_id reference to conversations table
-- Required for independent bot chat system

-- Add columns if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'conversations' AND column_name = 'is_bot_chat'
    ) THEN
        ALTER TABLE public.conversations ADD COLUMN is_bot_chat BOOLEAN DEFAULT false;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'conversations' AND column_name = 'bot_id'
    ) THEN
        ALTER TABLE public.conversations ADD COLUMN bot_id UUID REFERENCES public.bots(id) ON DELETE SET NULL;
    END IF;
END
$$;

-- Add index for bot chat lookups
CREATE INDEX IF NOT EXISTS idx_conversations_bot_chat ON public.conversations (is_bot_chat) WHERE is_bot_chat = true;
CREATE INDEX IF NOT EXISTS idx_conversations_bot_id ON public.conversations (bot_id) WHERE bot_id IS NOT NULL;

-- RLS: users can see bot chats they participate in
-- (existing conversation policies should already cover this via participant_ids)

-- Create simplified send_message RPC for bot chat context
CREATE OR REPLACE FUNCTION public.send_message(
    p_conversation_id UUID,
    p_sender_id UUID,
    p_content_type TEXT,
    p_content TEXT,
    p_metadata JSONB DEFAULT '{}'
) RETURNS messages AS $$
DECLARE
    v_message messages;
BEGIN
    INSERT INTO public.messages (
        conversation_id,
        sender_id,
        sender_type,
        content_type,
        content,
        metadata
    ) VALUES (
        p_conversation_id,
        p_sender_id,
        'user',
        p_content_type,
        p_content::jsonb,
        p_metadata
    )
    RETURNING * INTO v_message;

    RETURN v_message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;