-- =====================================================
-- ADMIN CONSOLE - PART 5
-- JIT (Just-In-Time) escalation for Security Admin
-- =====================================================

-- Permissions for JIT
INSERT INTO public.admin_permissions (scope, resource, action, description, risk_level, is_system)
VALUES
  ('security.jit.request', 'security', 'jit.request', 'Request JIT escalation', 'critical', true),
  ('security.jit.approve', 'security', 'jit.approve', 'Approve JIT escalation requests', 'critical', true),
  ('security.jit.read', 'security', 'jit.read', 'Read active JIT escalations', 'high', true)
ON CONFLICT (scope) DO NOTHING;

-- Grant permissions: only security_admin can request JIT, only owner can approve
WITH roles AS (
  SELECT id, name FROM public.admin_roles WHERE name IN ('security_admin', 'owner')
), perms AS (
  SELECT id, scope FROM public.admin_permissions WHERE scope IN ('security.jit.request','security.jit.approve','security.jit.read')
)
INSERT INTO public.admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN perms p ON (
  (p.scope = 'security.jit.request' AND r.name = 'security_admin')
  OR (p.scope = 'security.jit.approve' AND r.name = 'owner')
  OR (p.scope = 'security.jit.read' AND r.name = 'owner')
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMENT ON TABLE public.owner_escalation_requests IS 'JIT escalation requests: Security Admin requests, Owner approves';
