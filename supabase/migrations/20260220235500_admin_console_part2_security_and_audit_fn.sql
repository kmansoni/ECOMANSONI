-- =====================================================
-- ADMIN CONSOLE - PART 2
-- Security hardening (RLS) + Audit append function (hash chain)
-- =====================================================

-- Ensure required extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- 1) RLS: lock down all admin tables to service_role only
-- =====================================================

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'admin_users',
        'admin_roles',
        'admin_permissions',
        'admin_role_permissions',
        'admin_user_roles',
        'owners',
        'owner_escalation_requests',
        'admin_sessions',
        'audit_hash_anchors',
        'approvals',
        'approval_steps',
        'admin_policies',
        'moderation_reports',
        'moderation_cases',
        'moderation_actions'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t.tablename);

    -- Drop old policies (idempotent)
    EXECUTE format('DROP POLICY IF EXISTS "service_role_all" ON public.%I', t.tablename);

    -- Single policy for all actions
    EXECUTE format(
      'CREATE POLICY "service_role_all" ON public.%I FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')',
      t.tablename
    );
  END LOOP;
END$$;

-- admin_audit_events: keep append-only; ensure service_role can SELECT/INSERT only
ALTER TABLE public.admin_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role can read audit events" ON public.admin_audit_events;
DROP POLICY IF EXISTS "service_role can insert audit events" ON public.admin_audit_events;
DROP POLICY IF EXISTS "service_role_all" ON public.admin_audit_events;

CREATE POLICY "service_role can read audit events" ON public.admin_audit_events
  FOR SELECT
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role can insert audit events" ON public.admin_audit_events
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- =====================================================
-- 2) Audit append function (atomic hash chain)
-- =====================================================

-- Helper: stable JSON stringify by using jsonb::text
CREATE OR REPLACE FUNCTION public.admin_audit_compute_hash(prev_hash TEXT, payload JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(extensions.digest(convert_to(coalesce(prev_hash, '') || payload::text, 'utf8'), 'sha256'::text), 'hex');
$$;

-- Append audit event with correct prev hash + self hash.
-- Uses advisory lock to serialize writes and avoid hash chain forks.
CREATE OR REPLACE FUNCTION public.admin_audit_append(
  p_actor_type TEXT,
  p_actor_id UUID,
  p_actor_role TEXT,
  p_actor_session_id UUID,
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id TEXT,
  p_severity TEXT,
  p_reason_code TEXT,
  p_reason_description TEXT,
  p_ticket_id TEXT,
  p_approval_id UUID,
  p_request_id UUID,
  p_ip_address INET,
  p_user_agent TEXT,
  p_status TEXT,
  p_error_code TEXT,
  p_error_message TEXT,
  p_before_state JSONB,
  p_after_state JSONB,
  p_metadata JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_hash TEXT;
  v_payload JSONB;
  v_self_hash TEXT;
  v_id UUID;
BEGIN
  -- Serialize to avoid concurrent chain forks
  PERFORM pg_advisory_xact_lock(hashtext('admin_audit_events_hash_chain'));

  SELECT hash_self
    INTO v_prev_hash
  FROM public.admin_audit_events
  ORDER BY sequence_number DESC
  LIMIT 1;

  v_payload := jsonb_build_object(
    'actor_type', p_actor_type,
    'actor_id', p_actor_id,
    'actor_role', p_actor_role,
    'actor_session_id', p_actor_session_id,
    'action', p_action,
    'resource_type', p_resource_type,
    'resource_id', p_resource_id,
    'severity', p_severity,
    'reason_code', p_reason_code,
    'reason_description', p_reason_description,
    'ticket_id', p_ticket_id,
    'approval_id', p_approval_id,
    'request_id', p_request_id,
    'ip_address', p_ip_address,
    'user_agent', p_user_agent,
    'status', p_status,
    'error_code', p_error_code,
    'error_message', p_error_message,
    'before_state', p_before_state,
    'after_state', p_after_state,
    'metadata', p_metadata
  );

  v_self_hash := public.admin_audit_compute_hash(v_prev_hash, v_payload);

  INSERT INTO public.admin_audit_events (
    actor_type,
    actor_id,
    actor_role,
    actor_session_id,
    action,
    resource_type,
    resource_id,
    severity,
    reason_code,
    reason_description,
    ticket_id,
    approval_id,
    request_id,
    ip_address,
    user_agent,
    status,
    error_code,
    error_message,
    before_state,
    after_state,
    metadata,
    hash_prev,
    hash_self
  ) VALUES (
    p_actor_type,
    p_actor_id,
    p_actor_role,
    p_actor_session_id,
    p_action,
    p_resource_type,
    p_resource_id,
    p_severity,
    p_reason_code,
    p_reason_description,
    p_ticket_id,
    p_approval_id,
    p_request_id,
    p_ip_address,
    p_user_agent,
    p_status,
    p_error_code,
    p_error_message,
    p_before_state,
    p_after_state,
    p_metadata,
    v_prev_hash,
    v_self_hash
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_audit_append FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_audit_compute_hash FROM PUBLIC;

COMMENT ON FUNCTION public.admin_audit_append IS 'Append-only audit writer with tamper-evident hash chain';

-- =====================================================
-- 3) Seed minimal roles/permissions for admin-api MVP
-- =====================================================

-- Roles
INSERT INTO public.admin_roles (name, display_name, description, category, is_system)
VALUES
  ('owner', 'Owner', 'Messenger owner: IAM + security oversight, no user-data access by default', 'owner', true),
  ('security_admin', 'Security Admin', 'Security operations, investigations, approvals', 'security', true),
  ('sre_admin', 'SRE Admin', 'Operations/infra monitoring and config changes', 'operations', true),
  ('readonly_auditor', 'Read-only Auditor', 'Read-only access to admin domain via admin-api', 'readonly', true)
ON CONFLICT (name) DO NOTHING;

-- Permissions (scopes)
INSERT INTO public.admin_permissions (scope, resource, action, description, risk_level, is_system)
VALUES
  ('iam.admin.read', 'iam', 'admin.read', 'List admin users', 'medium', true),
  ('iam.admin.create', 'iam', 'admin.create', 'Create admin user', 'high', true),
  ('iam.admin.deactivate', 'iam', 'admin.deactivate', 'Deactivate admin user', 'high', true),
  ('audit.read.all', 'audit', 'read.all', 'Read admin audit events', 'critical', true),
  ('approvals.request', 'approvals', 'request', 'Request approval for dangerous operation', 'high', true),
  ('approvals.decide', 'approvals', 'decide', 'Approve/Deny approval requests', 'high', true)
ON CONFLICT (scope) DO NOTHING;

-- Role-permissions
WITH r AS (
  SELECT id, name FROM public.admin_roles WHERE name IN ('owner', 'security_admin', 'sre_admin', 'readonly_auditor')
), p AS (
  SELECT id, scope FROM public.admin_permissions
)
INSERT INTO public.admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM r
JOIN p ON (
  (r.name = 'owner' AND p.scope IN ('iam.admin.read','iam.admin.create','iam.admin.deactivate','audit.read.all','approvals.request','approvals.decide'))
  OR (r.name = 'security_admin' AND p.scope IN ('iam.admin.read','audit.read.all','approvals.request','approvals.decide'))
  OR (r.name = 'sre_admin' AND p.scope IN ('iam.admin.read','approvals.request'))
  OR (r.name = 'readonly_auditor' AND p.scope IN ('iam.admin.read','audit.read.all'))
)
ON CONFLICT (role_id, permission_id) DO NOTHING;
