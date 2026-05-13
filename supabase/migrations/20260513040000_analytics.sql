-- Telegram Analytics Events

CREATE TABLE IF NOT EXISTS public.telegram_analytics_events (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    event_name TEXT NOT NULL,
    properties JSONB,
    user_id UUID,
    session_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address INET
);

ALTER TABLE public.telegram_analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service can insert analytics" ON public.telegram_analytics_events 
    FOR INSERT USING (true) WITH CHECK (true);

CREATE INDEX idx_analytics_event ON public.telegram_analytics_events(event_name);
CREATE INDEX idx_analytics_user ON public.telegram_analytics_events(user_id);
CREATE INDEX idx_analytics_created ON public.telegram_analytics_events(created_at);