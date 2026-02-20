-- =====================================================
-- ADMIN CONSOLE - PART 4
-- Kill switches (server-enforced)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.admin_kill_switches (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  reason TEXT,
  updated_by UUID REFERENCES public.admin_users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lock table down to service_role only (admin-api)
ALTER TABLE public.admin_kill_switches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_kill_switches FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON public.admin_kill_switches;
CREATE POLICY "service_role_all" ON public.admin_kill_switches
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Seed keys
INSERT INTO public.admin_kill_switches (key, enabled, reason)
VALUES
  ('admin_writes', false, 'Blocks admin write operations (role assignment, create/deactivate admins, approvals decisions)') ,
  ('approvals', false, 'Blocks approvals create/decide'),
  ('iam_writes', false, 'Blocks IAM writes (create/deactivate admin, role assign/revoke)')
ON CONFLICT (key) DO NOTHING;

-- Permissions
INSERT INTO public.admin_permissions (scope, resource, action, description, risk_level, is_system)
VALUES
  ('security.killswitch.read', 'security', 'killswitch.read', 'Read kill switch states', 'high', true),
  ('security.killswitch.set', 'security', 'killswitch.set', 'Set kill switch states', 'critical', true)
ON CONFLICT (scope) DO NOTHING;

-- Map to roles (owner + security_admin can read; only owner can set by policy in admin-api)
WITH roles AS (
  SELECT id, name FROM public.admin_roles WHERE name IN ('owner', 'security_admin', 'sre_admin', 'readonly_auditor')
), perms AS (
  SELECT id, scope FROM public.admin_permissions WHERE scope IN ('security.killswitch.read','security.killswitch.set')
)
INSERT INTO public.admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN perms p ON (
  (p.scope = 'security.killswitch.read' AND r.name IN ('owner','security_admin','sre_admin','readonly_auditor'))
  OR (p.scope = 'security.killswitch.set' AND r.name IN ('owner'))
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMENT ON TABLE public.admin_kill_switches IS 'Server-enforced kill switches for admin console';
