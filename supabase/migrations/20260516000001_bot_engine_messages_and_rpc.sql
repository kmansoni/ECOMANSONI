-- Bot Engine: bot_messages table, increment_bot_analytics RPC, per-bot webhook secret
-- ============================================================================

-- 1. BOT MESSAGES — таблица для отслеживания сообщений, отправленных ботами
CREATE TABLE IF NOT EXISTS public.bot_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
    chat_id UUID NOT NULL,
    message_id UUID NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    raw_update JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bot_messages_bot ON public.bot_messages (bot_id);
CREATE INDEX idx_bot_messages_chat ON public.bot_messages (chat_id);
CREATE INDEX idx_bot_messages_message ON public.bot_messages (message_id);
CREATE INDEX idx_bot_messages_created ON public.bot_messages (created_at DESC);

ALTER TABLE public.bot_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bot owners view messages" ON public.bot_messages
    FOR SELECT USING (bot_id IN (SELECT id FROM public.bots WHERE owner_id = auth.uid()));

CREATE POLICY "Service role full access on bot_messages" ON public.bot_messages
    FOR ALL USING (auth.role() = 'service_role');

-- 2. PER-BOT WEBHOOK SECRET (реализация в отдельной таблице, если ещё нет)
-- Поле webhook_secret переехало из глобальной переменной в таблицу bots
-- ALTER TABLE public.bots ADD COLUMN IF NOT EXISTS webhook_secret TEXT;

-- 3. INCREMENT BOT ANALYTICS RPC
-- Атомарно инкрементирует счётчики аналитики бота за указанную дату
CREATE OR REPLACE FUNCTION public.increment_bot_analytics(
    p_bot_id UUID,
    p_date TEXT,
    p_messages_sent INTEGER DEFAULT 0,
    p_messages_received INTEGER DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_existing INTEGER;
BEGIN
    -- Попытка обновить существующую запись
    UPDATE bot_analytics
    SET messages_sent = messages_sent + p_messages_sent,
        messages_received = messages_received + p_messages_received,
        updated_at = now()
    WHERE bot_id = p_bot_id AND date = p_date;

    GET DIAGNOSTICS v_existing = ROW_COUNT;

    -- Если записи не было — вставляем
    IF v_existing = 0 THEN
        INSERT INTO bot_analytics (bot_id, date, messages_sent, messages_received)
        VALUES (p_bot_id, p_date, p_messages_sent, p_messages_received);
    END IF;

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- 4. ADD webhook_secret TO bots TABLE (если ещё не добавлено)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'bots' AND column_name = 'webhook_secret'
    ) THEN
        ALTER TABLE public.bots ADD COLUMN webhook_secret TEXT;
    END IF;
END
$$;