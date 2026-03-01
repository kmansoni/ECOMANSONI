-- ============================================================================
-- BOTS AND MINI-APPS PLATFORM MIGRATION
-- ============================================================================
-- Telegram-like Bot Platform with Mini Apps support

-- 1. EXTEND CHAT FOLDER ITEM KIND
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_folder_item_kind') THEN
        ALTER TYPE chat_folder_item_kind ADD VALUE IF NOT EXISTS 'bot';
        ALTER TYPE chat_folder_item_kind ADD VALUE IF NOT EXISTS 'mini_app';
        ALTER TYPE chat_folder_item_kind ADD VALUE IF NOT EXISTS 'game';
    END IF;
END $$;

-- 2. ENUM TYPES FOR BOTS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bot_chat_type') THEN
        CREATE TYPE bot_chat_type AS ENUM ('private', 'group', 'supergroup', 'channel');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bot_status') THEN
        CREATE TYPE bot_status AS ENUM ('active', 'disabled', 'archived');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_entity_type') THEN
        CREATE TYPE message_entity_type AS ENUM (
            'mention', 'hashtag', 'bot_command', 'url', 'email',
            'bold', 'italic', 'underline', 'strikethrough',
            'code', 'pre', 'text_link', 'text_mention'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'keyboard_type') THEN
        CREATE TYPE keyboard_type AS ENUM ('reply', 'inline', 'remove');
    END IF;
END $$;

-- 3. BOTS TABLE
CREATE TABLE IF NOT EXISTS public.bots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    username TEXT NOT NULL UNIQUE CHECK (username ~* '^[a-zA-Z][a-zA-Z0-9_]{4,31}$'),
    display_name TEXT NOT NULL,
    description TEXT,
    about TEXT,
    avatar_url TEXT,
    bot_chat_type bot_chat_type DEFAULT 'private',
    status bot_status DEFAULT 'active',
    is_verified BOOLEAN DEFAULT false,
    can_join_groups BOOLEAN DEFAULT true,
    can_read_all_group_messages BOOLEAN DEFAULT false,
    is_private BOOLEAN DEFAULT false,
    language_code TEXT DEFAULT 'ru',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT bot_owner_username_unique UNIQUE (owner_id, username)
);

CREATE INDEX idx_bots_owner ON public.bots (owner_id);
CREATE INDEX idx_bots_username ON public.bots (username);
CREATE INDEX idx_bots_status ON public.bots (status);

-- 4. BOT TOKENS TABLE
CREATE TABLE IF NOT EXISTS public.bot_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE CHECK (length(token) >= 32),
    name TEXT,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT bot_token_unique UNIQUE (bot_id, name)
);

CREATE INDEX idx_bot_tokens_bot ON public.bot_tokens (bot_id);
CREATE INDEX idx_bot_tokens_token ON public.bot_tokens (token);

-- 5. BOT COMMANDS TABLE
CREATE TABLE IF NOT EXISTS public.bot_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
    command TEXT NOT NULL CHECK (command ~* '^[a-zA-Z][a-zA-Z0-9_]{0,31}$'),
    description TEXT,
    language_code TEXT DEFAULT 'en',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT bot_command_unique UNIQUE (bot_id, command, language_code)
);

CREATE INDEX idx_bot_commands_bot ON public.bot_commands (bot_id);

-- 6. MINI APPS TABLE
CREATE TABLE IF NOT EXISTS public.mini_apps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    bot_id UUID REFERENCES public.bots(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE CHECK (slug ~* '^[a-zA-Z0-9-]{3,50}$'),
    description TEXT,
    icon_url TEXT,
    url TEXT NOT NULL,
    version TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT mini_app_owner_slug_unique UNIQUE (owner_id, slug)
);

CREATE INDEX idx_mini_apps_owner ON public.mini_apps (owner_id);
CREATE INDEX idx_mini_apps_slug ON public.mini_apps (slug);
CREATE INDEX idx_mini_apps_bot ON public.mini_apps (bot_id);

-- 7. MINI APP SESSIONS TABLE
CREATE TABLE IF NOT EXISTS public.mini_app_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mini_app_id UUID NOT NULL REFERENCES public.mini_apps(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    platform TEXT,
    device_info JSONB,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER
);

CREATE INDEX idx_mini_app_sessions_app ON public.mini_app_sessions (mini_app_id);
CREATE INDEX idx_mini_app_sessions_user ON public.mini_app_sessions (user_id);

-- 8. BOT MESSAGES TABLE
CREATE TABLE IF NOT EXISTS public.bot_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
    chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    raw_update JSONB,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bot_messages_bot ON public.bot_messages (bot_id);
CREATE INDEX idx_bot_messages_chat ON public.bot_messages (chat_id);
CREATE INDEX idx_bot_messages_message ON public.bot_messages (message_id);
CREATE INDEX idx_bot_messages_created ON public.bot_messages (created_at);

-- 9. BOT CHATS (conversations with bots)
CREATE TABLE IF NOT EXISTS public.bot_chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    chat_id UUID REFERENCES public.chats(id) ON DELETE SET NULL,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    message_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT bot_chat_unique UNIQUE (bot_id, user_id)
);

CREATE INDEX idx_bot_chats_bot ON public.bot_chats (bot_id);
CREATE INDEX idx_bot_chats_user ON public.bot_chats (user_id);
CREATE INDEX idx_bot_chats_chat ON public.bot_chats (chat_id);

-- 10. BOT WEBHOOKS
CREATE TABLE IF NOT EXISTS public.bot_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
    url TEXT NOT NULL CHECK (url ~* '^https?://'),
    secret_token TEXT,
    is_active BOOLEAN DEFAULT true,
    last_triggered_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT bot_webhook_unique UNIQUE (bot_id)
);

CREATE INDEX idx_bot_webhooks_bot ON public.bot_webhooks (bot_id);

-- 11. BOT ANALYTICS
CREATE TABLE IF NOT EXISTS public.bot_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    messages_sent INTEGER DEFAULT 0,
    messages_received INTEGER DEFAULT 0,
    unique_users INTEGER DEFAULT 0,
    new_subscriptions INTEGER DEFAULT 0,
    total_commands INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT bot_analytics_unique UNIQUE (bot_id, date)
);

CREATE INDEX idx_bot_analytics_bot_date ON public.bot_analytics (bot_id, date DESC);

-- 12. GRANTS
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mansoni_app') THEN
        GRANT USAGE ON SCHEMA public TO mansoni_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mansoni_app;
        GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO mansoni_app;
    END IF;
END $$;

-- 13. ROW LEVEL SECURITY
ALTER TABLE public.bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mini_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mini_app_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can manage own bots" ON public.bots;
DROP POLICY IF EXISTS "Owners can manage own bot tokens" ON public.bot_tokens;
DROP POLICY IF EXISTS "Owners can manage own bot commands" ON public.bot_commands;
DROP POLICY IF EXISTS "Owners can manage own mini apps" ON public.mini_apps;
DROP POLICY IF EXISTS "Users can track own mini app sessions" ON public.mini_app_sessions;
DROP POLICY IF EXISTS "Bot owners can manage bot messages" ON public.bot_messages;
DROP POLICY IF EXISTS "Users can view own bot chats" ON public.bot_chats;
DROP POLICY IF EXISTS "Bot owners can manage webhooks" ON public.bot_webhooks;
DROP POLICY IF EXISTS "Bot owners can view analytics" ON public.bot_analytics;
DROP POLICY IF EXISTS "Anyone can view active bot info" ON public.bots;

-- Bot policies
CREATE POLICY "Owners can manage own bots" ON public.bots
    FOR ALL USING (owner_id = auth.uid());

CREATE POLICY "Owners can manage own bot tokens" ON public.bot_tokens
    FOR ALL USING (
        bot_id IN (SELECT id FROM public.bots WHERE owner_id = auth.uid())
    );

CREATE POLICY "Owners can manage own bot commands" ON public.bot_commands
    FOR ALL USING (
        bot_id IN (SELECT id FROM public.bots WHERE owner_id = auth.uid())
    );

CREATE POLICY "Owners can manage own mini apps" ON public.mini_apps
    FOR ALL USING (owner_id = auth.uid());

CREATE POLICY "Users can track own mini app sessions" ON public.mini_app_sessions
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Bot owners can manage bot messages" ON public.bot_messages
    FOR ALL USING (
        bot_id IN (SELECT id FROM public.bots WHERE owner_id = auth.uid())
    );

CREATE POLICY "Users can view own bot chats" ON public.bot_chats
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Bot owners can manage webhooks" ON public.bot_webhooks
    FOR ALL USING (
        bot_id IN (SELECT id FROM public.bots WHERE owner_id = auth.uid())
    );

CREATE POLICY "Bot owners can view analytics" ON public.bot_analytics
    FOR ALL USING (
        bot_id IN (SELECT id FROM public.bots WHERE owner_id = auth.uid())
    );

-- Public read access for bot info (username, display_name, avatar - for discovery)
CREATE POLICY "Anyone can view active bot info" ON public.bots
    FOR SELECT USING (status = 'active');

-- 14. TRIGGER FOR UPDATED_AT
CREATE OR REPLACE FUNCTION public.bot_updated_at_trigger()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bots_updated_at ON public.bots;
CREATE TRIGGER bots_updated_at
    BEFORE UPDATE ON public.bots
    FOR EACH ROW EXECUTE FUNCTION public.bot_updated_at_trigger();

DROP TRIGGER IF EXISTS mini_apps_updated_at ON public.mini_apps;
CREATE TRIGGER mini_apps_updated_at
    BEFORE UPDATE ON public.mini_apps
    FOR EACH ROW EXECUTE FUNCTION public.bot_updated_at_trigger();

DROP TRIGGER IF EXISTS bot_chats_updated_at ON public.bot_chats;
CREATE TRIGGER bot_chats_updated_at
    BEFORE UPDATE ON public.bot_chats
    FOR EACH ROW EXECUTE FUNCTION public.bot_updated_at_trigger();

DROP TRIGGER IF EXISTS bot_webhooks_updated_at ON public.bot_webhooks;
CREATE TRIGGER bot_webhooks_updated_at
    BEFORE UPDATE ON public.bot_webhooks
    FOR EACH ROW EXECUTE FUNCTION public.bot_updated_at_trigger();

-- 15. HELPER FUNCTION FOR BOT USERNAME GENERATION
CREATE OR REPLACE FUNCTION public.generate_bot_username(base_name TEXT, owner_id UUID)
RETURNS TEXT AS $$
DECLARE
    suffix INTEGER;
    username TEXT;
BEGIN
    username := lower(regexp_replace(base_name, '[^a-zA-Z0-9_]', '', 'g'));
    suffix := 0;
    
    WHILE EXISTS (
        SELECT 1 FROM public.bots 
        WHERE username = (username || suffix::TEXT) 
        AND owner_id != COALESCE(owner_id, owner_id)
    ) LOOP
        suffix := suffix + 1;
    END LOOP;
    
    RETURN username || suffix::TEXT;
END;
$$ LANGUAGE plpgsql;

-- 16. UPDATED_AT FOR PROFILES (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_name = 'profiles_updated_at'
    ) THEN
        CREATE TRIGGER profiles_updated_at
            BEFORE UPDATE ON public.profiles
            FOR EACH ROW EXECUTE FUNCTION public.bot_updated_at_trigger();
    END IF;
END $$;
