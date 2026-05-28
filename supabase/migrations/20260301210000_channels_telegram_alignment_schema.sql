-- =============================================================================
-- Migration: Channel Module Schema Enhancement (Telegram Alignment)
-- File: 20260301210000_channels_telegram_alignment_schema.sql
-- Description: Adds missing columns, new tables, indexes, RLS policies, and
--              triggers to align the channel module with Telegram's data model.
--              Schema-only migration — RPC functions are in a separate file.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SECTION 1: ALTER channels — add missing Telegram-aligned columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS signatures_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS protected_content BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS slow_mode_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS linked_chat_id UUID;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS pinned_message_id UUID;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS default_reactions TEXT[] DEFAULT '{}';
-- ---------------------------------------------------------------------------
-- SECTION 2: ALTER channel_messages — add missing columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.channel_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE public.channel_messages ADD COLUMN IF NOT EXISTS views_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.channel_messages ADD COLUMN IF NOT EXISTS forwards_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.channel_messages ADD COLUMN IF NOT EXISTS reply_to_message_id UUID;
ALTER TABLE public.channel_messages ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.channel_messages ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE public.channel_messages ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.channel_messages ADD COLUMN IF NOT EXISTS album_id UUID;
ALTER TABLE public.channel_messages ADD COLUMN IF NOT EXISTS author_signature TEXT;
-- ---------------------------------------------------------------------------
-- SECTION 3: ALTER channel_members — add admin/ban rights columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.channel_members ADD COLUMN IF NOT EXISTS admin_title TEXT;
ALTER TABLE public.channel_members ADD COLUMN IF NOT EXISTS admin_rights BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.channel_members ADD COLUMN IF NOT EXISTS banned_rights BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.channel_members ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ;
-- ---------------------------------------------------------------------------
-- SECTION 4: CREATE TABLE channel_message_reactions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.channel_message_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.channel_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(message_id, user_id, emoji)
);
-- ---------------------------------------------------------------------------
-- SECTION 5: CREATE TABLE channel_message_views
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.channel_message_views (
    message_id UUID NOT NULL REFERENCES public.channel_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(message_id, user_id)
);
-- ---------------------------------------------------------------------------
-- SECTION 6: CREATE TABLE channel_invite_links
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.channel_invite_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
    created_by UUID NOT NULL,
    link_code TEXT NOT NULL UNIQUE,
    title TEXT,
    usage_limit INTEGER,
    usage_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ,
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    is_permanent BOOLEAN NOT NULL DEFAULT false,
    is_revoked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.channel_invite_links
    ADD COLUMN IF NOT EXISTS created_by UUID,
    ADD COLUMN IF NOT EXISTS link_code TEXT,
    ADD COLUMN IF NOT EXISTS title TEXT,
    ADD COLUMN IF NOT EXISTS usage_limit INTEGER,
    ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_permanent BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN NOT NULL DEFAULT false;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'channel_invite_links'
          AND column_name = 'token'
    ) THEN
        UPDATE public.channel_invite_links
        SET link_code = token
        WHERE link_code IS NULL;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'channel_invite_links'
          AND column_name = 'max_uses'
    ) THEN
        UPDATE public.channel_invite_links
        SET usage_limit = max_uses
        WHERE usage_limit IS NULL;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'channel_invite_links'
          AND column_name = 'used_count'
    ) THEN
        UPDATE public.channel_invite_links
        SET usage_count = COALESCE(used_count, 0)
        WHERE usage_count IS NULL OR usage_count = 0;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'channel_invite_links'
          AND column_name = 'is_active'
    ) THEN
        UPDATE public.channel_invite_links
        SET is_revoked = NOT COALESCE(is_active, true)
        WHERE is_revoked IS NULL;
    END IF;
END $$;
-- ---------------------------------------------------------------------------
-- SECTION 7: CREATE TABLE channel_join_requests
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.channel_join_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    invite_link_id UUID REFERENCES public.channel_invite_links(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    processed_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    UNIQUE(channel_id, user_id, status)
);
-- ---------------------------------------------------------------------------
-- SECTION 8: CREATE TABLE channel_audit_log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.channel_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL,
    action TEXT NOT NULL,
    target_id UUID,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- ---------------------------------------------------------------------------
-- SECTION 9: INDEXES
-- ---------------------------------------------------------------------------

-- channel_message_reactions
CREATE INDEX IF NOT EXISTS idx_channel_message_reactions_message_id
    ON public.channel_message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_channel_message_reactions_user_id
    ON public.channel_message_reactions(user_id);
-- channel_message_views
CREATE INDEX IF NOT EXISTS idx_channel_message_views_message_id
    ON public.channel_message_views(message_id);
-- channel_invite_links
CREATE INDEX IF NOT EXISTS idx_channel_invite_links_channel_id
    ON public.channel_invite_links(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_invite_links_link_code
    ON public.channel_invite_links(link_code);
-- channel_join_requests
CREATE INDEX IF NOT EXISTS idx_channel_join_requests_channel_status
    ON public.channel_join_requests(channel_id, status);
-- channel_audit_log
CREATE INDEX IF NOT EXISTS idx_channel_audit_log_channel_created
    ON public.channel_audit_log(channel_id, created_at DESC);
-- channels: sparse index on username
CREATE INDEX IF NOT EXISTS idx_channels_username
    ON public.channels(username)
    WHERE username IS NOT NULL;
-- channel_messages: scheduled messages
CREATE INDEX IF NOT EXISTS idx_channel_messages_scheduled
    ON public.channel_messages(channel_id, scheduled_at)
    WHERE scheduled_at IS NOT NULL;
-- channel_messages: pinned messages
CREATE INDEX IF NOT EXISTS idx_channel_messages_pinned
    ON public.channel_messages(channel_id, pinned)
    WHERE pinned = true;
-- channel_messages: album grouping
CREATE INDEX IF NOT EXISTS idx_channel_messages_album_id
    ON public.channel_messages(album_id)
    WHERE album_id IS NOT NULL;
-- ---------------------------------------------------------------------------
-- SECTION 10: ENABLE RLS on new tables
-- ---------------------------------------------------------------------------

ALTER TABLE public.channel_message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_message_views     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_invite_links      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_join_requests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_audit_log         ENABLE ROW LEVEL SECURITY;
-- ---------------------------------------------------------------------------
-- SECTION 11: RLS POLICIES — channel_message_reactions
-- Anyone can read reactions on public channels.
-- Authenticated users can insert/delete their own reactions.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "reactions_select_public" ON public.channel_message_reactions;
CREATE POLICY "reactions_select_public"
    ON public.channel_message_reactions
    FOR SELECT
    USING (true);
DROP POLICY IF EXISTS "reactions_insert_own" ON public.channel_message_reactions;
CREATE POLICY "reactions_insert_own"
    ON public.channel_message_reactions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "reactions_delete_own" ON public.channel_message_reactions;
CREATE POLICY "reactions_delete_own"
    ON public.channel_message_reactions
    FOR DELETE
    USING (auth.uid() = user_id);
-- ---------------------------------------------------------------------------
-- SECTION 12: RLS POLICIES — channel_message_views
-- Only system (SECURITY DEFINER functions) can insert.
-- Channel members can read.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "views_select_member" ON public.channel_message_views;
CREATE POLICY "views_select_member"
    ON public.channel_message_views
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.channel_messages cm
            JOIN public.channel_members mb ON mb.channel_id = cm.channel_id
            WHERE cm.id = channel_message_views.message_id
              AND mb.user_id = auth.uid()
        )
    );
-- No INSERT policy for regular users — inserts go through RPC with SECURITY DEFINER.

-- ---------------------------------------------------------------------------
-- SECTION 13: RLS POLICIES — channel_invite_links
-- Admins can CRUD.
-- Any member can read permanent/non-revoked links.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "invite_links_select_member" ON public.channel_invite_links;
CREATE POLICY "invite_links_select_member"
    ON public.channel_invite_links
    FOR SELECT
    USING (
        is_permanent = true
        AND is_revoked = false
        AND EXISTS (
            SELECT 1 FROM public.channel_members
            WHERE channel_id = channel_invite_links.channel_id
              AND user_id = auth.uid()
        )
    );
DROP POLICY IF EXISTS "invite_links_admin_all" ON public.channel_invite_links;
CREATE POLICY "invite_links_admin_all"
    ON public.channel_invite_links
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.channel_members
            WHERE channel_id = channel_invite_links.channel_id
              AND user_id = auth.uid()
              AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.channel_members
            WHERE channel_id = channel_invite_links.channel_id
              AND user_id = auth.uid()
              AND role IN ('owner', 'admin')
        )
    );
-- ---------------------------------------------------------------------------
-- SECTION 14: RLS POLICIES — channel_join_requests
-- Admins can read and update all requests in their channels.
-- Requesting user can read their own request.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "join_requests_select_own" ON public.channel_join_requests;
CREATE POLICY "join_requests_select_own"
    ON public.channel_join_requests
    FOR SELECT
    USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "join_requests_admin_select" ON public.channel_join_requests;
CREATE POLICY "join_requests_admin_select"
    ON public.channel_join_requests
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.channel_members
            WHERE channel_id = channel_join_requests.channel_id
              AND user_id = auth.uid()
              AND role IN ('owner', 'admin')
        )
    );
DROP POLICY IF EXISTS "join_requests_admin_update" ON public.channel_join_requests;
CREATE POLICY "join_requests_admin_update"
    ON public.channel_join_requests
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.channel_members
            WHERE channel_id = channel_join_requests.channel_id
              AND user_id = auth.uid()
              AND role IN ('owner', 'admin')
        )
    );
DROP POLICY IF EXISTS "join_requests_insert_self" ON public.channel_join_requests;
CREATE POLICY "join_requests_insert_self"
    ON public.channel_join_requests
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
-- ---------------------------------------------------------------------------
-- SECTION 15: RLS POLICIES — channel_audit_log
-- Only admins/owners of the channel can read the audit log.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "audit_log_admin_select" ON public.channel_audit_log;
CREATE POLICY "audit_log_admin_select"
    ON public.channel_audit_log
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.channel_members
            WHERE channel_id = channel_audit_log.channel_id
              AND user_id = auth.uid()
              AND role IN ('owner', 'admin')
        )
    );
-- ---------------------------------------------------------------------------
-- SECTION 16: Realtime publication — reactions
-- ---------------------------------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_message_reactions;
-- ---------------------------------------------------------------------------
-- SECTION 17: TRIGGER — auto-increment views_count on channel_messages
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.channel_increment_views_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.channel_messages
    SET views_count = views_count + 1
    WHERE id = NEW.message_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_channel_increment_views ON public.channel_message_views;
CREATE TRIGGER trg_channel_increment_views
    AFTER INSERT ON public.channel_message_views
    FOR EACH ROW EXECUTE FUNCTION public.channel_increment_views_count();
