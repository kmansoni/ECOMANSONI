-- =============================================================================
-- Migration: Channel Module RPC Functions (Telegram Alignment)
-- File: 20260301211000_channels_telegram_alignment_rpc.sql
-- Description: Adds all missing RPC functions for the channel module to align
--              with Telegram's feature set. Depends on schema migration:
--              20260301210000_channels_telegram_alignment_schema.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Admin rights bitmask constants (used in comments for reference)
-- Bit 0  (1)   = change_info
-- Bit 1  (2)   = post_messages
-- Bit 2  (4)   = edit_messages
-- Bit 3  (8)   = delete_messages
-- Bit 4  (16)  = ban_users
-- Bit 5  (32)  = invite_users
-- Bit 6  (64)  = pin_messages
-- Bit 7  (128) = add_admins
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- HELPER: channel_audit_log insert shorthand
-- ---------------------------------------------------------------------------

-- (Used inline in each function rather than a nested call to keep them atomic)

-- =============================================================================
-- 1. channel_edit_info_v1 — Edit channel name/description/avatar
-- =============================================================================

CREATE OR REPLACE FUNCTION public.channel_edit_info_v1(
    _channel_id UUID,
    _title      TEXT,
    _description TEXT,
    _avatar_url  TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_role   TEXT;
    v_rights BIGINT;
BEGIN
    -- Fetch caller membership
    SELECT role, admin_rights
    INTO v_role, v_rights
    FROM channel_members
    WHERE channel_id = _channel_id AND user_id = v_caller;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_MEMBER';
    END IF;

    -- Owner always allowed; admin needs change_info bit (1)
    IF v_role = 'owner' OR (v_role = 'admin' AND (v_rights & 1) <> 0) THEN
        -- proceed
    ELSE
        RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;

    UPDATE channels
    SET
        title       = COALESCE(_title,       title),
        description = COALESCE(_description, description),
        avatar_url  = COALESCE(_avatar_url,  avatar_url),
        updated_at  = now()
    WHERE id = _channel_id;

    INSERT INTO channel_audit_log(channel_id, actor_id, action, details)
    VALUES (_channel_id, v_caller, 'edit_info', jsonb_build_object(
        'title', _title,
        'description', _description,
        'avatar_url', _avatar_url
    ));

    RETURN TRUE;
END;
$$;
-- =============================================================================
-- 2. channel_edit_message_v1 — Edit a published message
-- =============================================================================

CREATE OR REPLACE FUNCTION public.channel_edit_message_v1(
    _channel_id  UUID,
    _message_id  UUID,
    _content     TEXT,
    _media_url   TEXT,
    _media_type  TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller     UUID := auth.uid();
    v_role       TEXT;
    v_rights     BIGINT;
    v_author_id  UUID;
BEGIN
    -- Fetch message author
    SELECT author_id INTO v_author_id
    FROM channel_messages
    WHERE id = _message_id AND channel_id = _channel_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'MESSAGE_NOT_FOUND';
    END IF;

    -- Fetch caller membership
    SELECT role, admin_rights
    INTO v_role, v_rights
    FROM channel_members
    WHERE channel_id = _channel_id AND user_id = v_caller;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_MEMBER';
    END IF;

    -- Author can always edit their own message; admin needs edit_messages bit (4)
    IF v_caller = v_author_id
       OR v_role = 'owner'
       OR (v_role = 'admin' AND (v_rights & 4) <> 0)
    THEN
        -- proceed
    ELSE
        RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;

    UPDATE channel_messages
    SET
        content    = COALESCE(_content,    content),
        media_url  = COALESCE(_media_url,  media_url),
        media_type = COALESCE(_media_type, media_type),
        edited_at  = now()
    WHERE id = _message_id AND channel_id = _channel_id;

    RETURN TRUE;
END;
$$;
-- =============================================================================
-- 3. channel_toggle_reaction_v1 — Toggle emoji reaction on a message
-- =============================================================================

CREATE OR REPLACE FUNCTION public.channel_toggle_reaction_v1(
    _channel_id UUID,
    _message_id UUID,
    _emoji      TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_exists BOOLEAN;
BEGIN
    -- Verify caller is a member (or channel is public — check membership)
    IF NOT EXISTS (
        SELECT 1 FROM channel_members
        WHERE channel_id = _channel_id AND user_id = v_caller
    ) THEN
        RAISE EXCEPTION 'NOT_MEMBER';
    END IF;

    -- Verify message belongs to channel
    IF NOT EXISTS (
        SELECT 1 FROM channel_messages
        WHERE id = _message_id AND channel_id = _channel_id
    ) THEN
        RAISE EXCEPTION 'MESSAGE_NOT_FOUND';
    END IF;

    -- Check if reaction exists
    SELECT EXISTS (
        SELECT 1 FROM channel_message_reactions
        WHERE message_id = _message_id AND user_id = v_caller AND emoji = _emoji
    ) INTO v_exists;

    IF v_exists THEN
        DELETE FROM channel_message_reactions
        WHERE message_id = _message_id AND user_id = v_caller AND emoji = _emoji;
        RETURN 'removed';
    ELSE
        INSERT INTO channel_message_reactions(message_id, user_id, emoji)
        VALUES (_message_id, v_caller, _emoji);
        RETURN 'added';
    END IF;
END;
$$;
-- =============================================================================
-- 4. channel_record_view_v1 — Record unique view of a message
-- =============================================================================

CREATE OR REPLACE FUNCTION public.channel_record_view_v1(
    _channel_id UUID,
    _message_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
BEGIN
    -- Verify message belongs to channel
    IF NOT EXISTS (
        SELECT 1 FROM channel_messages
        WHERE id = _message_id AND channel_id = _channel_id AND is_published = true
    ) THEN
        RETURN FALSE;
    END IF;

    -- Insert view (trigger auto-increments views_count); ignore if already viewed
    INSERT INTO channel_message_views(message_id, user_id)
    VALUES (_message_id, v_caller)
    ON CONFLICT DO NOTHING;

    RETURN TRUE;
END;
$$;
-- =============================================================================
-- 5. channel_pin_message_v1 — Pin/unpin a message
-- =============================================================================

CREATE OR REPLACE FUNCTION public.channel_pin_message_v1(
    _channel_id UUID,
    _message_id UUID,
    _pinned     BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_role   TEXT;
    v_rights BIGINT;
BEGIN
    SELECT role, admin_rights
    INTO v_role, v_rights
    FROM channel_members
    WHERE channel_id = _channel_id AND user_id = v_caller;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_MEMBER';
    END IF;

    -- pin_messages bit (64)
    IF v_role <> 'owner' AND NOT (v_role = 'admin' AND (v_rights & 64) <> 0) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;

    -- Verify message exists in channel
    IF NOT EXISTS (
        SELECT 1 FROM channel_messages
        WHERE id = _message_id AND channel_id = _channel_id
    ) THEN
        RAISE EXCEPTION 'MESSAGE_NOT_FOUND';
    END IF;

    UPDATE channel_messages
    SET pinned = _pinned
    WHERE id = _message_id AND channel_id = _channel_id;

    -- Update pinned_message_id on channel when pinning
    IF _pinned THEN
        UPDATE channels
        SET pinned_message_id = _message_id
        WHERE id = _channel_id;
    ELSE
        -- Clear pinned_message_id only if it was this message
        UPDATE channels
        SET pinned_message_id = NULL
        WHERE id = _channel_id AND pinned_message_id = _message_id;
    END IF;

    INSERT INTO channel_audit_log(channel_id, actor_id, action, target_id, details)
    VALUES (_channel_id, v_caller,
            CASE WHEN _pinned THEN 'pin_message' ELSE 'unpin_message' END,
            _message_id, '{}');

    RETURN TRUE;
END;
$$;
-- =============================================================================
-- 6. channel_forward_message_v1 — Record a forward
-- =============================================================================

CREATE OR REPLACE FUNCTION public.channel_forward_message_v1(
    _channel_id UUID,
    _message_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
BEGIN
    -- Verify message belongs to channel and is published
    IF NOT EXISTS (
        SELECT 1 FROM channel_messages
        WHERE id = _message_id AND channel_id = _channel_id AND is_published = true
    ) THEN
        RAISE EXCEPTION 'MESSAGE_NOT_FOUND';
    END IF;

    UPDATE channel_messages
    SET forwards_count = forwards_count + 1
    WHERE id = _message_id AND channel_id = _channel_id;

    RETURN TRUE;
END;
$$;
-- =============================================================================
-- 7. channel_update_settings_v1 — Update channel settings
-- =============================================================================

CREATE OR REPLACE FUNCTION public.channel_update_settings_v1(
    _channel_id           UUID,
    _signatures_enabled   BOOLEAN,
    _protected_content    BOOLEAN,
    _slow_mode_seconds    INTEGER,
    _default_reactions    TEXT[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_role   TEXT;
    v_rights BIGINT;
BEGIN
    SELECT role, admin_rights
    INTO v_role, v_rights
    FROM channel_members
    WHERE channel_id = _channel_id AND user_id = v_caller;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_MEMBER';
    END IF;

    -- change_info bit (1) or owner
    IF v_role <> 'owner' AND NOT (v_role = 'admin' AND (v_rights & 1) <> 0) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;

    UPDATE channels
    SET
        signatures_enabled = COALESCE(_signatures_enabled, signatures_enabled),
        protected_content  = COALESCE(_protected_content,  protected_content),
        slow_mode_seconds  = COALESCE(_slow_mode_seconds,  slow_mode_seconds),
        default_reactions  = COALESCE(_default_reactions,  default_reactions),
        updated_at         = now()
    WHERE id = _channel_id;

    INSERT INTO channel_audit_log(channel_id, actor_id, action, details)
    VALUES (_channel_id, v_caller, 'update_settings', jsonb_build_object(
        'signatures_enabled', _signatures_enabled,
        'protected_content',  _protected_content,
        'slow_mode_seconds',  _slow_mode_seconds
    ));

    RETURN TRUE;
END;
$$;
-- =============================================================================
-- 8. channel_set_username_v1 — Set/remove channel username
-- =============================================================================

CREATE OR REPLACE FUNCTION public.channel_set_username_v1(
    _channel_id UUID,
    _username   TEXT  -- pass NULL to remove
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_role   TEXT;
BEGIN
    SELECT role INTO v_role
    FROM channel_members
    WHERE channel_id = _channel_id AND user_id = v_caller;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_MEMBER';
    END IF;

    -- Only owner can set username
    IF v_role <> 'owner' THEN
        RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;

    -- Validate username format when not NULL (5-32 chars, lowercase alphanumeric+underscore)
    IF _username IS NOT NULL THEN
        IF _username !~ '^[a-z0-9_]{5,32}$' THEN
            RAISE EXCEPTION 'INVALID_USERNAME_FORMAT';
        END IF;

        -- Check uniqueness
        IF EXISTS (
            SELECT 1 FROM channels
            WHERE username = _username AND id <> _channel_id
        ) THEN
            RAISE EXCEPTION 'USERNAME_TAKEN';
        END IF;
    END IF;

    UPDATE channels
    SET username   = _username,
        updated_at = now()
    WHERE id = _channel_id;

    INSERT INTO channel_audit_log(channel_id, actor_id, action, details)
    VALUES (_channel_id, v_caller, 'set_username', jsonb_build_object('username', _username));

    RETURN TRUE;
END;
$$;
-- =============================================================================
-- 9. channel_create_invite_link_v1 — Create invite link
-- =============================================================================

CREATE OR REPLACE FUNCTION public.channel_create_invite_link_v1(
    _channel_id        UUID,
    _title             TEXT,
    _usage_limit       INTEGER,
    _expires_at        TIMESTAMPTZ,
    _requires_approval BOOLEAN
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller    UUID := auth.uid();
    v_role      TEXT;
    v_rights    BIGINT;
    v_link_code TEXT;
    v_link_id   UUID;
BEGIN
    SELECT role, admin_rights
    INTO v_role, v_rights
    FROM channel_members
    WHERE channel_id = _channel_id AND user_id = v_caller;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_MEMBER';
    END IF;

    -- invite_users bit (32) or owner
    IF v_role <> 'owner' AND NOT (v_role = 'admin' AND (v_rights & 32) <> 0) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;

    -- Generate unique 10-char alphanumeric link code
    LOOP
        v_link_code := substring(
            replace(replace(replace(encode(gen_random_bytes(8), 'base64'), '+', 'a'), '/', 'b'), '=', ''),
            1, 10
        );
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM channel_invite_links WHERE link_code = v_link_code
        );
    END LOOP;

    INSERT INTO channel_invite_links(
        channel_id, created_by, link_code, title,
        usage_limit, expires_at, requires_approval
    )
    VALUES (
        _channel_id, v_caller, v_link_code, _title,
        _usage_limit, _expires_at, COALESCE(_requires_approval, false)
    )
    RETURNING id INTO v_link_id;

    INSERT INTO channel_audit_log(channel_id, actor_id, action, target_id, details)
    VALUES (_channel_id, v_caller, 'create_invite_link', v_link_id,
            jsonb_build_object('link_code', v_link_code, 'title', _title));

    RETURN v_link_id;
END;
$$;
-- =============================================================================
-- 10. channel_revoke_invite_link_v1 — Revoke invite link
-- =============================================================================

CREATE OR REPLACE FUNCTION public.channel_revoke_invite_link_v1(
    _channel_id UUID,
    _link_id    UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_role   TEXT;
    v_rights BIGINT;
BEGIN
    SELECT role, admin_rights
    INTO v_role, v_rights
    FROM channel_members
    WHERE channel_id = _channel_id AND user_id = v_caller;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_MEMBER';
    END IF;

    IF v_role <> 'owner' AND NOT (v_role = 'admin' AND (v_rights & 32) <> 0) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;

    UPDATE channel_invite_links
    SET is_revoked = true
    WHERE id = _link_id AND channel_id = _channel_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'LINK_NOT_FOUND';
    END IF;

    INSERT INTO channel_audit_log(channel_id, actor_id, action, target_id, details)
    VALUES (_channel_id, v_caller, 'revoke_invite_link', _link_id, '{}');

    RETURN TRUE;
END;
$$;
-- =============================================================================
-- 11. channel_join_via_invite_v1 — Join channel via invite link
-- =============================================================================

CREATE OR REPLACE FUNCTION public.channel_join_via_invite_v1(
    _link_code TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller   UUID := auth.uid();
    v_link     RECORD;
BEGIN
    SELECT * INTO v_link
    FROM channel_invite_links
    WHERE link_code = _link_code;

    IF NOT FOUND THEN
        RETURN 'expired';
    END IF;

    IF v_link.is_revoked THEN
        RETURN 'revoked';
    END IF;

    IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
        RETURN 'expired';
    END IF;

    IF v_link.usage_limit IS NOT NULL AND v_link.usage_count >= v_link.usage_limit THEN
        RETURN 'full';
    END IF;

    -- Already a member?
    IF EXISTS (
        SELECT 1 FROM channel_members
        WHERE channel_id = v_link.channel_id AND user_id = v_caller
    ) THEN
        RETURN 'joined';
    END IF;

    -- Increment usage
    UPDATE channel_invite_links
    SET usage_count = usage_count + 1
    WHERE id = v_link.id;

    IF v_link.requires_approval THEN
        -- Create join request
        INSERT INTO channel_join_requests(channel_id, user_id, invite_link_id)
        VALUES (v_link.channel_id, v_caller, v_link.id)
        ON CONFLICT (channel_id, user_id, status) DO NOTHING;

        RETURN 'pending';
    ELSE
        -- Add member directly
        INSERT INTO channel_members(channel_id, user_id, role)
        VALUES (v_link.channel_id, v_caller, 'member')
        ON CONFLICT DO NOTHING;

        -- Increment subscriber count
        UPDATE channels
        SET subscriber_count = subscriber_count + 1
        WHERE id = v_link.channel_id;

        RETURN 'joined';
    END IF;
END;
$$;
-- =============================================================================
-- 12. channel_process_join_request_v1 — Approve/reject join request
-- =============================================================================

CREATE OR REPLACE FUNCTION public.channel_process_join_request_v1(
    _channel_id UUID,
    _request_id UUID,
    _approve    BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller     UUID := auth.uid();
    v_role       TEXT;
    v_rights     BIGINT;
    v_request    RECORD;
BEGIN
    SELECT role, admin_rights
    INTO v_role, v_rights
    FROM channel_members
    WHERE channel_id = _channel_id AND user_id = v_caller;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_MEMBER';
    END IF;

    IF v_role <> 'owner' AND NOT (v_role = 'admin' AND (v_rights & 32) <> 0) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;

    SELECT * INTO v_request
    FROM channel_join_requests
    WHERE id = _request_id AND channel_id = _channel_id AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'REQUEST_NOT_FOUND';
    END IF;

    UPDATE channel_join_requests
    SET status       = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
        processed_by = v_caller,
        processed_at = now()
    WHERE id = _request_id;

    IF _approve THEN
        INSERT INTO channel_members(channel_id, user_id, role)
        VALUES (_channel_id, v_request.user_id, 'member')
        ON CONFLICT DO NOTHING;

        UPDATE channels
        SET subscriber_count = subscriber_count + 1
        WHERE id = _channel_id;
    END IF;

    INSERT INTO channel_audit_log(channel_id, actor_id, action, target_id, details)
    VALUES (_channel_id, v_caller,
            CASE WHEN _approve THEN 'approve_join_request' ELSE 'reject_join_request' END,
            _request_id,
            jsonb_build_object('user_id', v_request.user_id));

    RETURN TRUE;
END;
$$;
-- =============================================================================
-- 13. channel_ban_member_v1 — Ban a member
-- =============================================================================

CREATE OR REPLACE FUNCTION public.channel_ban_member_v1(
    _channel_id      UUID,
    _target_user_id  UUID,
    _banned_rights   BIGINT,
    _until           TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_role   TEXT;
    v_rights BIGINT;
BEGIN
    IF v_caller = _target_user_id THEN
        RAISE EXCEPTION 'CANNOT_BAN_SELF';
    END IF;

    SELECT role, admin_rights
    INTO v_role, v_rights
    FROM channel_members
    WHERE channel_id = _channel_id AND user_id = v_caller;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_MEMBER';
    END IF;

    -- ban_users bit (16)
    IF v_role <> 'owner' AND NOT (v_role = 'admin' AND (v_rights & 16) <> 0) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;

    -- Cannot ban another owner
    IF EXISTS (
        SELECT 1 FROM channel_members
        WHERE channel_id = _channel_id AND user_id = _target_user_id AND role = 'owner'
    ) THEN
        RAISE EXCEPTION 'CANNOT_BAN_OWNER';
    END IF;

    INSERT INTO channel_members(channel_id, user_id, role, banned_rights, banned_until)
    VALUES (_channel_id, _target_user_id, 'banned', COALESCE(_banned_rights, -1), _until)
    ON CONFLICT (channel_id, user_id) DO UPDATE
        SET role          = 'banned',
            banned_rights = COALESCE(EXCLUDED.banned_rights, -1),
            banned_until  = EXCLUDED.banned_until;

    -- Decrement subscriber count if was member
    UPDATE channels
    SET subscriber_count = GREATEST(0, subscriber_count - 1)
    WHERE id = _channel_id
      AND EXISTS (
          SELECT 1 FROM channel_members
          WHERE channel_id = _channel_id AND user_id = _target_user_id
            AND role IN ('member', 'admin')
      );

    INSERT INTO channel_audit_log(channel_id, actor_id, action, target_id, details)
    VALUES (_channel_id, v_caller, 'ban_member', _target_user_id,
            jsonb_build_object('banned_rights', _banned_rights, 'banned_until', _until));

    RETURN TRUE;
END;
$$;
-- =============================================================================
-- 14. channel_unban_member_v1 — Unban a member
-- =============================================================================

CREATE OR REPLACE FUNCTION public.channel_unban_member_v1(
    _channel_id     UUID,
    _target_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_role   TEXT;
    v_rights BIGINT;
BEGIN
    SELECT role, admin_rights
    INTO v_role, v_rights
    FROM channel_members
    WHERE channel_id = _channel_id AND user_id = v_caller;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_MEMBER';
    END IF;

    IF v_role <> 'owner' AND NOT (v_role = 'admin' AND (v_rights & 16) <> 0) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;

    -- Remove the banned entry entirely
    DELETE FROM channel_members
    WHERE channel_id = _channel_id
      AND user_id = _target_user_id
      AND role = 'banned';

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    INSERT INTO channel_audit_log(channel_id, actor_id, action, target_id, details)
    VALUES (_channel_id, v_caller, 'unban_member', _target_user_id, '{}');

    RETURN TRUE;
END;
$$;
-- =============================================================================
-- 15. channel_edit_admin_v1 — Edit admin rights
-- =============================================================================

CREATE OR REPLACE FUNCTION public.channel_edit_admin_v1(
    _channel_id      UUID,
    _target_user_id  UUID,
    _admin_rights    BIGINT,
    _admin_title     TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller      UUID := auth.uid();
    v_caller_role TEXT;
    v_caller_rights BIGINT;
BEGIN
    IF v_caller = _target_user_id THEN
        RAISE EXCEPTION 'CANNOT_EDIT_SELF_ADMIN';
    END IF;

    SELECT role, admin_rights
    INTO v_caller_role, v_caller_rights
    FROM channel_members
    WHERE channel_id = _channel_id AND user_id = v_caller;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_MEMBER';
    END IF;

    -- add_admins bit (128)
    IF v_caller_role <> 'owner' AND NOT (v_caller_role = 'admin' AND (v_caller_rights & 128) <> 0) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;

    -- Target must be a member of the channel
    IF NOT EXISTS (
        SELECT 1 FROM channel_members
        WHERE channel_id = _channel_id AND user_id = _target_user_id
    ) THEN
        RAISE EXCEPTION 'TARGET_NOT_MEMBER';
    END IF;

    UPDATE channel_members
    SET role         = 'admin',
        admin_rights = COALESCE(_admin_rights, 0),
        admin_title  = _admin_title
    WHERE channel_id = _channel_id AND user_id = _target_user_id;

    INSERT INTO channel_audit_log(channel_id, actor_id, action, target_id, details)
    VALUES (_channel_id, v_caller, 'edit_admin', _target_user_id,
            jsonb_build_object('admin_rights', _admin_rights, 'admin_title', _admin_title));

    RETURN TRUE;
END;
$$;
-- =============================================================================
-- 16. channel_get_stats_v1 — Get channel statistics
-- =============================================================================

CREATE OR REPLACE FUNCTION public.channel_get_stats_v1(
    _channel_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller         UUID := auth.uid();
    v_role           TEXT;
    v_subscriber_cnt BIGINT;
    v_total_views    BIGINT;
    v_post_count     BIGINT;
    v_avg_views      NUMERIC;
    v_recent_growth  BIGINT;
BEGIN
    SELECT role INTO v_role
    FROM channel_members
    WHERE channel_id = _channel_id AND user_id = v_caller;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_MEMBER';
    END IF;

    -- Only owner/admin can see statistics
    IF v_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;

    SELECT subscriber_count INTO v_subscriber_cnt
    FROM channels WHERE id = _channel_id;

    SELECT
        COUNT(*),
        COALESCE(SUM(views_count), 0)
    INTO v_post_count, v_total_views
    FROM channel_messages
    WHERE channel_id = _channel_id AND is_published = true;

    v_avg_views := CASE WHEN v_post_count > 0
                        THEN ROUND(v_total_views::NUMERIC / v_post_count, 2)
                        ELSE 0 END;

    -- Members who joined in last 7 days
    SELECT COUNT(*) INTO v_recent_growth
    FROM channel_members
    WHERE channel_id = _channel_id
      AND joined_at >= now() - INTERVAL '7 days';

    RETURN json_build_object(
        'subscriber_count',     v_subscriber_cnt,
        'total_views',          v_total_views,
        'post_count',           v_post_count,
        'avg_views_per_post',   v_avg_views,
        'recent_growth_7d',     v_recent_growth
    );
END;
$$;
-- =============================================================================
-- 17. channel_schedule_message_v1 — Schedule a message for future posting
-- =============================================================================

CREATE OR REPLACE FUNCTION public.channel_schedule_message_v1(
    _channel_id   UUID,
    _content      TEXT,
    _media_url    TEXT,
    _media_type   TEXT,
    _scheduled_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller    UUID := auth.uid();
    v_role      TEXT;
    v_rights    BIGINT;
    v_msg_id    UUID;
BEGIN
    SELECT role, admin_rights
    INTO v_role, v_rights
    FROM channel_members
    WHERE channel_id = _channel_id AND user_id = v_caller;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_MEMBER';
    END IF;

    -- post_messages bit (2)
    IF v_role <> 'owner' AND NOT (v_role = 'admin' AND (v_rights & 2) <> 0) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;

    IF _scheduled_at IS NULL OR _scheduled_at <= now() THEN
        RAISE EXCEPTION 'INVALID_SCHEDULED_AT';
    END IF;

    INSERT INTO channel_messages(
        channel_id, author_id, content,
        media_url, media_type,
        scheduled_at, is_published
    )
    VALUES (
        _channel_id, v_caller, COALESCE(_content, ''),
        _media_url, _media_type,
        _scheduled_at, false
    )
    RETURNING id INTO v_msg_id;

    RETURN v_msg_id;
END;
$$;
-- =============================================================================
-- 18. channel_publish_scheduled_v1 — Publish a scheduled message now
-- =============================================================================

CREATE OR REPLACE FUNCTION public.channel_publish_scheduled_v1(
    _channel_id UUID,
    _message_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_role   TEXT;
    v_rights BIGINT;
BEGIN
    SELECT role, admin_rights
    INTO v_role, v_rights
    FROM channel_members
    WHERE channel_id = _channel_id AND user_id = v_caller;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_MEMBER';
    END IF;

    -- post_messages bit (2)
    IF v_role <> 'owner' AND NOT (v_role = 'admin' AND (v_rights & 2) <> 0) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;

    UPDATE channel_messages
    SET is_published = true,
        scheduled_at = NULL,
        created_at   = now()  -- treat publish time as creation time for ordering
    WHERE id = _message_id
      AND channel_id = _channel_id
      AND is_published = false;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'MESSAGE_NOT_FOUND_OR_ALREADY_PUBLISHED';
    END IF;

    RETURN TRUE;
END;
$$;
-- =============================================================================
-- GRANT EXECUTE to authenticated role
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.channel_edit_info_v1(UUID, TEXT, TEXT, TEXT)                                             TO authenticated;
GRANT EXECUTE ON FUNCTION public.channel_edit_message_v1(UUID, UUID, TEXT, TEXT, TEXT)                                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.channel_toggle_reaction_v1(UUID, UUID, TEXT)                                             TO authenticated;
GRANT EXECUTE ON FUNCTION public.channel_record_view_v1(UUID, UUID)                                                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.channel_pin_message_v1(UUID, UUID, BOOLEAN)                                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.channel_forward_message_v1(UUID, UUID)                                                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.channel_update_settings_v1(UUID, BOOLEAN, BOOLEAN, INTEGER, TEXT[])                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.channel_set_username_v1(UUID, TEXT)                                                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.channel_create_invite_link_v1(UUID, TEXT, INTEGER, TIMESTAMPTZ, BOOLEAN)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.channel_revoke_invite_link_v1(UUID, UUID)                                                TO authenticated;
GRANT EXECUTE ON FUNCTION public.channel_join_via_invite_v1(TEXT)                                                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.channel_process_join_request_v1(UUID, UUID, BOOLEAN)                                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.channel_ban_member_v1(UUID, UUID, BIGINT, TIMESTAMPTZ)                                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.channel_unban_member_v1(UUID, UUID)                                                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.channel_edit_admin_v1(UUID, UUID, BIGINT, TEXT)                                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.channel_get_stats_v1(UUID)                                                               TO authenticated;
GRANT EXECUTE ON FUNCTION public.channel_schedule_message_v1(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.channel_publish_scheduled_v1(UUID, UUID)                                                 TO authenticated;
