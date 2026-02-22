-- ============================================================================
-- Hashtag status write-path v1 (admin/mod tooling)
--
-- Goals:
-- - Safe way to change public.hashtags.status with audit trail.
-- - Intended to be called by admin-api (service_role) after scope checks.
-- - Minimal cache invalidation for Explore payload.
--
-- Non-goals:
-- - No new UI surfaces.
-- - No breaking changes.
-- ============================================================================

-- 1) Admin permission scope for hashtag status changes
INSERT INTO public.admin_permissions (scope, resource, action, description, risk_level, is_system)
VALUES
  ('hashtag.status.write', 'hashtag', 'status.write', 'Change hashtag status (normal/restricted/hidden)', 'high', true)
ON CONFLICT (scope) DO NOTHING;

WITH roles AS (
  SELECT id, name FROM public.admin_roles WHERE name IN ('owner', 'security_admin')
), perms AS (
  SELECT id, scope FROM public.admin_permissions WHERE scope IN ('hashtag.status.write')
)
INSERT INTO public.admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN perms p ON p.scope = 'hashtag.status.write'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2) Helper: check admin scope (service_role only)
CREATE OR REPLACE FUNCTION public.admin_has_scope_v1(
  p_admin_user_id UUID,
  p_scope TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users au
    JOIN public.admin_user_roles aur ON aur.admin_user_id = au.id
    JOIN public.admin_role_permissions arp ON arp.role_id = aur.role_id
    JOIN public.admin_permissions ap ON ap.id = arp.permission_id
    WHERE au.id = p_admin_user_id
      AND au.status = 'active'
      AND ap.scope = p_scope
      AND (aur.expires_at IS NULL OR aur.expires_at > now())
  );
$$;

REVOKE ALL ON FUNCTION public.admin_has_scope_v1(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_has_scope_v1(UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.admin_has_scope_v1 IS
  'Service-only helper: checks whether an admin_user has the given scope via active role assignments.';

-- 3) Service RPC: set hashtag status + audit row + minimal explore cache invalidation
CREATE OR REPLACE FUNCTION public.set_hashtag_status_v1(
  p_hashtag TEXT,
  p_to_status TEXT,
  p_reason_codes TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_surface_policy JSONB DEFAULT '{}'::JSONB,
  p_notes TEXT DEFAULT NULL,
  p_actor_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  normalized_tag TEXT,
  from_status TEXT,
  to_status TEXT,
  status_updated_at TIMESTAMPTZ,
  change_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_to TEXT;
  v_norm TEXT;
  v_row public.hashtags%ROWTYPE;
  v_from TEXT;
  v_change_id UUID;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'set_hashtag_status_v1 requires service_role';
  END IF;

  v_to := lower(trim(COALESCE(p_to_status, '')));
  IF v_to NOT IN ('normal','restricted','hidden') THEN
    RAISE EXCEPTION 'Invalid hashtag status: %', v_to;
  END IF;

  v_norm := lower(regexp_replace(COALESCE(p_hashtag,''), '^#', ''));
  v_norm := regexp_replace(v_norm, '[^а-яА-ЯёЁa-zA-Z0-9_]+', '', 'g');
  IF length(v_norm) = 0 THEN
    RAISE EXCEPTION 'Invalid hashtag';
  END IF;

  -- If actor is present, enforce admin scope (via admin-api)
  IF p_actor_admin_user_id IS NOT NULL THEN
    IF NOT public.admin_has_scope_v1(p_actor_admin_user_id, 'hashtag.status.write') THEN
      RAISE EXCEPTION 'Missing scope hashtag.status.write for admin_user_id=%', p_actor_admin_user_id;
    END IF;
  END IF;

  SELECT * INTO v_row
  FROM public.hashtags
  WHERE normalized_tag = v_norm
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.hashtags (tag, normalized_tag, status, status_updated_at)
    VALUES (CONCAT('#', v_norm), v_norm, v_to, now())
    RETURNING * INTO v_row;
  END IF;

  v_from := COALESCE(v_row.status, 'normal');

  -- No-op when status is unchanged
  IF v_from = v_to THEN
    normalized_tag := v_norm;
    from_status := v_from;
    to_status := v_to;
    status_updated_at := v_row.status_updated_at;
    change_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.hashtags
  SET status = v_to,
      status_updated_at = now()
  WHERE id = v_row.id
  RETURNING status_updated_at INTO status_updated_at;

  INSERT INTO public.hashtag_status_changes (
    hashtag_id,
    from_status,
    to_status,
    actor_type,
    actor_id,
    reason_codes,
    surface_policy,
    notes
  ) VALUES (
    v_row.id,
    v_from,
    v_to,
    CASE WHEN p_actor_admin_user_id IS NULL THEN 'system' ELSE 'moderator' END,
    p_actor_admin_user_id,
    COALESCE(p_reason_codes, ARRAY[]::TEXT[]),
    COALESCE(p_surface_policy, '{}'::JSONB),
    p_notes
  ) RETURNING change_id INTO v_change_id;

  -- Minimal explore cache invalidation (read-path will rebuild lazily)
  UPDATE public.explore_cache_entries
  SET status = 'invalidated',
      expires_at = now(),
      reason_codes = (
        SELECT ARRAY(
          SELECT DISTINCT x
          FROM unnest(COALESCE(reason_codes, ARRAY[]::TEXT[]) || ARRAY['hashtag.status_changed']::TEXT[]) AS x
        )
      ),
      updated_at = now()
  WHERE status <> 'invalidated';

  normalized_tag := v_norm;
  from_status := v_from;
  to_status := v_to;
  change_id := v_change_id;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.set_hashtag_status_v1(TEXT, TEXT, TEXT[], JSONB, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_hashtag_status_v1(TEXT, TEXT, TEXT[], JSONB, TEXT, UUID) TO service_role;

COMMENT ON FUNCTION public.set_hashtag_status_v1 IS
  'Service-only: changes hashtag status with audit row + explore cache invalidation. Actor is an admin_user_id validated via admin_has_scope_v1.';
