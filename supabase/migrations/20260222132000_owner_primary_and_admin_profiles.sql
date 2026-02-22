-- =====================================================
-- ADMIN CONSOLE - OWNER PRIMARY + STAFF PROFILES
-- =====================================================

-- 1) Owners: mark one active primary owner
ALTER TABLE public.owners
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_owners_single_primary_active
  ON public.owners (is_primary)
  WHERE is_primary = true AND transferred_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.owners
    WHERE is_primary = true
      AND transferred_at IS NULL
  ) THEN
    UPDATE public.owners o
    SET is_primary = true
    WHERE o.id = (
      SELECT id
      FROM public.owners
      WHERE transferred_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1
    );
  END IF;
END
$$;

-- 2) Staff profile card for moderation/admin/owner operations
CREATE TABLE IF NOT EXISTS public.admin_staff_profiles (
  admin_user_id UUID PRIMARY KEY REFERENCES public.admin_users(id) ON DELETE CASCADE,
  staff_kind TEXT NOT NULL DEFAULT 'administrator'
    CHECK (staff_kind IN ('moderator', 'administrator', 'owner')),
  messenger_panel_access BOOLEAN NOT NULL DEFAULT false,
  can_assign_roles BOOLEAN NOT NULL DEFAULT false,
  can_manage_verifications BOOLEAN NOT NULL DEFAULT false,
  can_review_reports BOOLEAN NOT NULL DEFAULT false,
  timezone TEXT,
  notes TEXT,
  updated_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_staff_profiles_kind
  ON public.admin_staff_profiles(staff_kind);

CREATE INDEX IF NOT EXISTS idx_admin_staff_profiles_messenger
  ON public.admin_staff_profiles(messenger_panel_access);

-- Backfill one profile row per admin user
INSERT INTO public.admin_staff_profiles (
  admin_user_id,
  staff_kind,
  messenger_panel_access,
  can_assign_roles,
  can_manage_verifications,
  can_review_reports,
  created_at,
  updated_at
)
SELECT
  au.id,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.admin_user_roles aur
      JOIN public.admin_roles ar ON ar.id = aur.role_id
      WHERE aur.admin_user_id = au.id
        AND ar.name = 'owner'
        AND (aur.expires_at IS NULL OR aur.expires_at > now())
    ) THEN 'owner'
    WHEN EXISTS (
      SELECT 1
      FROM public.admin_user_roles aur
      JOIN public.admin_roles ar ON ar.id = aur.role_id
      WHERE aur.admin_user_id = au.id
        AND ar.category = 'moderation'
        AND (aur.expires_at IS NULL OR aur.expires_at > now())
    ) THEN 'moderator'
    ELSE 'administrator'
  END AS staff_kind,
  EXISTS (
    SELECT 1
    FROM public.admin_user_roles aur
    JOIN public.admin_role_permissions arp ON arp.role_id = aur.role_id
    JOIN public.admin_permissions ap ON ap.id = arp.permission_id
    WHERE aur.admin_user_id = au.id
      AND (aur.expires_at IS NULL OR aur.expires_at > now())
      AND ap.scope IN ('audit.read.all', 'audit.read.sev0')
  ) AS messenger_panel_access,
  EXISTS (
    SELECT 1
    FROM public.admin_user_roles aur
    JOIN public.admin_role_permissions arp ON arp.role_id = aur.role_id
    JOIN public.admin_permissions ap ON ap.id = arp.permission_id
    WHERE aur.admin_user_id = au.id
      AND (aur.expires_at IS NULL OR aur.expires_at > now())
      AND ap.scope = 'iam.role.assign'
  ) AS can_assign_roles,
  EXISTS (
    SELECT 1
    FROM public.admin_user_roles aur
    JOIN public.admin_role_permissions arp ON arp.role_id = aur.role_id
    JOIN public.admin_permissions ap ON ap.id = arp.permission_id
    WHERE aur.admin_user_id = au.id
      AND (aur.expires_at IS NULL OR aur.expires_at > now())
      AND ap.scope = 'verification.grant'
  ) AS can_manage_verifications,
  EXISTS (
    SELECT 1
    FROM public.admin_user_roles aur
    JOIN public.admin_roles ar ON ar.id = aur.role_id
    WHERE aur.admin_user_id = au.id
      AND (aur.expires_at IS NULL OR aur.expires_at > now())
      AND ar.category IN ('moderation', 'security')
  ) AS can_review_reports,
  now(),
  now()
FROM public.admin_users au
ON CONFLICT (admin_user_id) DO NOTHING;

-- 3) Admin permissions for staff profiles and primary owner controls
INSERT INTO public.admin_permissions (scope, resource, action, description, risk_level, is_system)
VALUES
  ('staff.profile.read', 'staff_profile', 'read', 'Read moderation/admin/owner staff profiles', 'medium', true),
  ('staff.profile.write', 'staff_profile', 'write', 'Update moderation/admin/owner staff profiles', 'high', true),
  ('owner.primary.read', 'owner', 'read_primary', 'Read current primary owner', 'medium', true),
  ('owner.primary.set', 'owner', 'set_primary', 'Set current primary owner', 'critical', true)
ON CONFLICT (scope) DO NOTHING;

WITH roles AS (
  SELECT id, name
  FROM public.admin_roles
  WHERE name IN ('owner', 'security_admin', 'readonly_auditor')
),
perms AS (
  SELECT id, scope
  FROM public.admin_permissions
  WHERE scope IN ('staff.profile.read','staff.profile.write','owner.primary.read','owner.primary.set')
)
INSERT INTO public.admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN perms p ON (
  (p.scope = 'staff.profile.read' AND r.name IN ('owner', 'security_admin', 'readonly_auditor')) OR
  (p.scope = 'staff.profile.write' AND r.name IN ('owner', 'security_admin')) OR
  (p.scope = 'owner.primary.read' AND r.name IN ('owner', 'security_admin', 'readonly_auditor')) OR
  (p.scope = 'owner.primary.set' AND r.name = 'owner')
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

