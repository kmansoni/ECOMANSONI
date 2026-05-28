-- ============================================================================
-- BOT ENGINE: Новые таблицы для независимой системы ботов
-- ============================================================================

-- 1. BOT SESSIONS — сессии диалога пользователя с ботом
CREATE TABLE IF NOT EXISTS public.bot_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.conversations(id),
    context JSONB DEFAULT '{}',
    state TEXT DEFAULT 'idle',
    variables JSONB DEFAULT '{}',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bot_sessions_bot ON public.bot_sessions (bot_id);
CREATE INDEX idx_bot_sessions_user ON public.bot_sessions (user_id);
CREATE INDEX idx_bot_sessions_bot_user ON public.bot_sessions (bot_id, user_id);
CREATE UNIQUE INDEX idx_bot_sessions_unique ON public.bot_sessions (bot_id, user_id) WHERE expires_at IS NULL;
-- 2. BOT HANDLERS — пользовательские обработчики (правила/сценарии)
CREATE TABLE IF NOT EXISTS public.bot_handlers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN (
        'keyword', 'command', 'callback', 'regex', 'ai', 'schedule',
        'welcome', 'fallback', 'media', 'reaction', 'member_joined', 'member_left'
    )),
    trigger_value TEXT,
    response_type TEXT NOT NULL CHECK (response_type IN (
        'text', 'photo', 'video', 'document', 'audio', 'voice',
        'sticker', 'animation', 'location', 'venue', 'contact',
        'poll', 'quiz', 'dice', 'keyboard', 'action', 'typing',
        'leave', 'invite', 'topic', 'forward', 'media_group'
    )),
    response_content JSONB NOT NULL DEFAULT '{}',
    priority INTEGER DEFAULT 50,
    is_active BOOLEAN DEFAULT true,
    ai_model TEXT,
    ai_prompt TEXT,
    ai_temperature NUMERIC(3,1) DEFAULT 0.7,
    ai_max_tokens INTEGER DEFAULT 500,
    conditions JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bot_handlers_bot ON public.bot_handlers (bot_id);
CREATE INDEX idx_bot_handlers_active ON public.bot_handlers (bot_id, is_active);
CREATE INDEX idx_bot_handlers_priority ON public.bot_handlers (bot_id, priority);
-- 3. BOT KEYBOARDS — переиспользуемые клавиатуры
CREATE TABLE IF NOT EXISTS public.bot_keyboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    keyboard_type TEXT NOT NULL CHECK (keyboard_type IN ('inline', 'reply', 'remove')),
    buttons JSONB NOT NULL DEFAULT '[]',
    is_persistent BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bot_keyboards_bot ON public.bot_keyboards (bot_id);
-- 4. BOT RUNS — лог выполнения обработчиков
CREATE TABLE IF NOT EXISTS public.bot_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.bot_sessions(id),
    trigger_type TEXT NOT NULL,
    trigger_value TEXT,
    input_payload JSONB,
    handler_id UUID,
    handler_name TEXT,
    response_method TEXT,
    response_payload JSONB,
    status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'error', 'timeout', 'skipped')),
    duration_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bot_runs_bot ON public.bot_runs (bot_id);
CREATE INDEX idx_bot_runs_session ON public.bot_runs (session_id);
CREATE INDEX idx_bot_runs_created ON public.bot_runs (created_at DESC);
-- 5. BOT CONVERSATION STATES — FSM для сценариев
CREATE TABLE IF NOT EXISTS public.bot_conversation_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    flow JSONB NOT NULL DEFAULT '{"nodes":[],"transitions":[]}',
    initial_state TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (bot_id, name)
);
CREATE INDEX idx_bot_states_bot ON public.bot_conversation_states (bot_id);
-- 6. BOT TOPICS — темы для обсуждений в чатах ботов
CREATE TABLE IF NOT EXISTS public.bot_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    message_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bot_topics_bot ON public.bot_topics (bot_id);
-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.bot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_handlers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_keyboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_conversation_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_topics ENABLE ROW LEVEL SECURITY;
-- Policies
CREATE POLICY "Bot owners manage sessions" ON public.bot_sessions
    FOR ALL USING (bot_id IN (SELECT id FROM public.bots WHERE owner_id = auth.uid()));
CREATE POLICY "Bot owners manage handlers" ON public.bot_handlers
    FOR ALL USING (bot_id IN (SELECT id FROM public.bots WHERE owner_id = auth.uid()));
CREATE POLICY "Bot owners manage keyboards" ON public.bot_keyboards
    FOR ALL USING (bot_id IN (SELECT id FROM public.bots WHERE owner_id = auth.uid()));
CREATE POLICY "Bot owners view runs" ON public.bot_runs
    FOR ALL USING (bot_id IN (SELECT id FROM public.bots WHERE owner_id = auth.uid()));
CREATE POLICY "Bot owners manage states" ON public.bot_conversation_states
    FOR ALL USING (bot_id IN (SELECT id FROM public.bots WHERE owner_id = auth.uid()));
CREATE POLICY "Bot owners manage topics" ON public.bot_topics
    FOR ALL USING (bot_id IN (SELECT id FROM public.bots WHERE owner_id = auth.uid()));
-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bot_updated_at_trigger()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER bot_sessions_updated_at BEFORE UPDATE ON public.bot_sessions
    FOR EACH ROW EXECUTE FUNCTION public.bot_updated_at_trigger();
CREATE TRIGGER bot_handlers_updated_at BEFORE UPDATE ON public.bot_handlers
    FOR EACH ROW EXECUTE FUNCTION public.bot_updated_at_trigger();
CREATE TRIGGER bot_keyboards_updated_at BEFORE UPDATE ON public.bot_keyboards
    FOR EACH ROW EXECUTE FUNCTION public.bot_updated_at_trigger();
CREATE TRIGGER bot_conversation_states_updated_at BEFORE UPDATE ON public.bot_conversation_states
    FOR EACH ROW EXECUTE FUNCTION public.bot_updated_at_trigger();
CREATE TRIGGER bot_topics_updated_at BEFORE UPDATE ON public.bot_topics
    FOR EACH ROW EXECUTE FUNCTION public.bot_updated_at_trigger();
