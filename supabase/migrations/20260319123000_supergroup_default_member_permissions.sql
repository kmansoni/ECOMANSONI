-- Migration: Supergroup default member permissions
-- Adds role-level defaults in supergroup settings and applies them automatically
-- when new members join a supergroup.

-- ── 1) Settings columns for defaults ────────────────────────────────────────

ALTER TABLE public.supergroup_settings
  ADD COLUMN IF NOT EXISTS default_member_can_send_messages boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_member_can_send_media boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_member_can_send_links boolean NOT NULL DEFAULT true;

-- ── 2) Trigger: apply defaults for newly joined members ─────────────────────

CREATE OR REPLACE FUNCTION public.apply_supergroup_default_member_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_defaults record;
BEGIN
  -- Apply only to supergroups.
  SELECT
    s.default_member_can_send_messages,
    s.default_member_can_send_media,
    s.default_member_can_send_links
  INTO v_defaults
  FROM public.supergroup_settings s
  WHERE s.conversation_id = NEW.conversation_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Admins/owners are unrestricted.
  IF COALESCE(NEW.role, 'member') IN ('owner', 'admin') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.supergroup_member_permissions (
    conversation_id,
    user_id,
    can_send_messages,
    can_send_media,
    can_send_links,
    muted_until
  )
  VALUES (
    NEW.conversation_id,
    NEW.user_id,
    v_defaults.default_member_can_send_messages,
    v_defaults.default_member_can_send_media,
    v_defaults.default_member_can_send_links,
    NULL
  )
  ON CONFLICT (conversation_id, user_id)
  DO UPDATE SET
    can_send_messages = EXCLUDED.can_send_messages,
    can_send_media = EXCLUDED.can_send_media,
    can_send_links = EXCLUDED.can_send_links,
    muted_until = EXCLUDED.muted_until,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_supergroup_default_member_permissions ON public.conversation_participants;
CREATE TRIGGER trg_apply_supergroup_default_member_permissions
  AFTER INSERT ON public.conversation_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_supergroup_default_member_permissions();

-- ── 3) Cleanup trigger: remove stale per-member restrictions on leave ───────

CREATE OR REPLACE FUNCTION public.cleanup_supergroup_member_permissions_on_leave()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.supergroup_member_permissions
  WHERE conversation_id = OLD.conversation_id
    AND user_id = OLD.user_id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_supergroup_member_permissions_on_leave ON public.conversation_participants;
CREATE TRIGGER trg_cleanup_supergroup_member_permissions_on_leave
  AFTER DELETE ON public.conversation_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_supergroup_member_permissions_on_leave();
