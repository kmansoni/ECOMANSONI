-- =====================================================
-- ADMIN CONSOLE - PART 3
-- Role assignment permissions + defaults
-- =====================================================

-- New permissions
INSERT INTO public.admin_permissions (scope, resource, action, description, risk_level, is_system)
VALUES
  ('iam.role.read', 'iam', 'role.read', 'List roles', 'medium', true),
  ('iam.role.assign', 'iam', 'role.assign', 'Assign roles to admins', 'critical', true),
  ('iam.role.revoke', 'iam', 'role.revoke', 'Revoke roles from admins', 'critical', true)
ON CONFLICT (scope) DO NOTHING;

-- Give owner role the assignment permissions
WITH owner_role AS (
  SELECT id FROM public.admin_roles WHERE name = 'owner'
), perms AS (
  SELECT id FROM public.admin_permissions WHERE scope IN ('iam.role.read','iam.role.assign','iam.role.revoke')
)
INSERT INTO public.admin_role_permissions (role_id, permission_id)
SELECT owner_role.id, perms.id
FROM owner_role, perms
ON CONFLICT (role_id, permission_id) DO NOTHING;
