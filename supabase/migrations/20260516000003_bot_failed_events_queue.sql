-- ============================================================================
-- Dead Letter Queue для проваленных бот-событий
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.bot_failed_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID REFERENCES public.bots(id) ON DELETE SET NULL,
    event_payload JSONB NOT NULL,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'retrying', 'failed', 'resolved')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bot_failed_events_bot ON public.bot_failed_events (bot_id);
CREATE INDEX idx_bot_failed_events_status ON public.bot_failed_events (status) WHERE status = 'pending';
CREATE INDEX idx_bot_failed_events_retry ON public.bot_failed_events (next_retry_at) WHERE status = 'pending';

ALTER TABLE public.bot_failed_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bot owners view failed events" ON public.bot_failed_events
    FOR SELECT USING (bot_id IN (SELECT id FROM public.bots WHERE owner_id = auth.uid()));

CREATE POLICY "Service role full access on bot_failed_events" ON public.bot_failed_events
    FOR ALL USING (auth.role() = 'service_role');

-- Trigger для updated_at
CREATE TRIGGER bot_failed_events_updated_at BEFORE UPDATE ON public.bot_failed_events
    FOR EACH ROW EXECUTE FUNCTION public.bot_updated_at_trigger();

-- Функция для ретрая проваленных событий
-- Вызывается через cron (pg_cron) каждые 5 минут
CREATE OR REPLACE FUNCTION public.retry_bot_failed_events()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    UPDATE INTO bot_failed_events (id, status, retry_count, next_retry_at, updated_at)
    SELECT
        id,
        CASE
            WHEN retry_count >= max_retries THEN 'failed'
            ELSE 'retrying'
        END,
        retry_count + 1,
        CASE
            WHEN retry_count + 1 < max_retries THEN now() + (interval '5 minutes' * (retry_count + 1))
            ELSE NULL
        END,
        now()
    WHERE status = 'pending'
      AND next_retry_at <= now()
      AND retry_count < max_retries
    RETURNING 1 INTO v_count;

    -- Считаем сколько строк было обновлено
    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- TODO: Здесь можно добавить вызов bot-engine/execute для повторной обработки
    -- Для production нужно реализовать HTTP-вызов к bot-engine

    RETURN v_count;
END;
$$;