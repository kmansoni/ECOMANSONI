-- =====================================================
-- ADMIN CONSOLE - VERIFICATIONS MANAGEMENT
-- Adds proper data model + permissions for verification operations.
-- =====================================================

-- 1) Expand user_verifications model for admin lifecycle
ALTER TABLE public.user_verifications
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_by_admin_id UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ticket_id TEXT;

-- 2) Allow multiple verification types per user (one row per type)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_verifications_user_id_key'
      AND conrelid = 'public.user_verifications'::regclass
  ) THEN
    ALTER TABLE public.user_verifications
      DROP CONSTRAINT user_verifications_user_id_key;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_verifications_user_type_key'
      AND conrelid = 'public.user_verifications'::regclass
  ) THEN
    ALTER TABLE public.user_verifications
      ADD CONSTRAINT user_verifications_user_type_key
      UNIQUE (user_id, verification_type);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_user_verifications_active
  ON public.user_verifications(user_id, is_active, verification_type);

CREATE INDEX IF NOT EXISTS idx_user_verifications_verified_by_admin
  ON public.user_verifications(verified_by_admin_id, verified_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_verifications_revoked_by_admin
  ON public.user_verifications(revoked_by_admin_id, revoked_at DESC);

-- 3) Permissions/scopes for admin-api
INSERT INTO public.admin_permissions (scope, resource, action, description, risk_level, is_system)
VALUES
  ('verification.read', 'verification', 'read', 'Read user verifications', 'medium', true),
  ('verification.grant', 'verification', 'grant', 'Grant verification badge to user', 'high', true),
  ('verification.revoke', 'verification', 'revoke', 'Revoke verification badge from user', 'high', true)
ON CONFLICT (scope) DO NOTHING;

WITH roles AS (
  SELECT id, name FROM public.admin_roles WHERE name IN ('owner', 'security_admin', 'readonly_auditor')
), perms AS (
  SELECT id, scope FROM public.admin_permissions WHERE scope IN ('verification.read','verification.grant','verification.revoke')
)
INSERT INTO public.admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN perms p ON (
  (p.scope = 'verification.read' AND r.name IN ('owner', 'security_admin', 'readonly_auditor'))
  OR (p.scope = 'verification.grant' AND r.name IN ('owner', 'security_admin'))
  OR (p.scope = 'verification.revoke' AND r.name IN ('owner', 'security_admin'))
)
ON CONFLICT (role_id, permission_id) DO NOTHING;
