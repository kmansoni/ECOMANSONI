-- =====================================================
-- ADMIN CONSOLE - DATABASE SCHEMA
-- Production-grade admin panel with strict security
-- =====================================================

-- =====================================================
-- 1. ADMIN IDENTITY & ACCESS MANAGEMENT (IAM)
-- =====================================================

-- Admin user accounts (separate from regular users)
CREATE TABLE public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'investigating')),
    
    -- Authentication
    sso_provider TEXT, -- 'google', 'okta', etc
    sso_subject TEXT, -- external user_id from SSO
    webauthn_credentials JSONB[], -- Array of {credential_id, public_key, counter, created_at}
    totp_secret TEXT, -- Encrypted TOTP secret
    backup_codes TEXT[], -- One-time recovery codes (hashed)
    
    -- Device binding
    registered_devices JSONB[], -- [{device_id, fingerprint, name, registered_at, last_used}]
    max_devices INT DEFAULT 3,
    
    -- Access controls
    allowed_ip_ranges CIDR[], -- IP allowlist
    allowed_countries TEXT[], -- ISO country codes
    require_managed_device BOOLEAN DEFAULT false,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES public.admin_users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ,
    last_login_ip INET,
    last_login_device TEXT,
    
    -- Deactivation
    deactivated_at TIMESTAMPTZ,
    deactivated_by UUID REFERENCES public.admin_users(id),
    deactivation_reason TEXT
);

CREATE INDEX idx_admin_users_status ON public.admin_users(status) WHERE status = 'active';
CREATE INDEX idx_admin_users_email ON public.admin_users(email);
CREATE INDEX idx_admin_users_sso ON public.admin_users(sso_provider, sso_subject);

COMMENT ON TABLE public.admin_users IS 'Admin accounts with MFA/WebAuthn enforcement';

-- =====================================================
-- 2. RBAC (Roles & Permissions)
-- =====================================================

-- Predefined roles
CREATE TABLE public.admin_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL CHECK (category IN ('owner', 'security', 'operations', 'moderation', 'support', 'compliance', 'finance', 'business', 'readonly')),
    
    -- Role constraints
    max_holders INT, -- Max number of admins with this role (e.g., Owner = 5)
    requires_approval BOOLEAN DEFAULT false,
    auto_expire_hours INT, -- For JIT roles
    
    -- Hierarchy
    parent_role_id UUID REFERENCES public.admin_roles(id),
    
    is_system BOOLEAN DEFAULT false, -- Cannot be deleted
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Predefined permissions (scopes)
CREATE TABLE public.admin_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope TEXT NOT NULL UNIQUE, -- e.g., 'users.action.ban'
    resource TEXT NOT NULL, -- e.g., 'users'
    action TEXT NOT NULL, -- e.g., 'ban'
    description TEXT,
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_permissions_resource ON public.admin_permissions(resource);

-- Role-Permission mapping
CREATE TABLE public.admin_role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES public.admin_roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.admin_permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    granted_by UUID REFERENCES public.admin_users(id),
    UNIQUE(role_id, permission_id)
);

CREATE INDEX idx_role_permissions_role ON public.admin_role_permissions(role_id);

-- User-Role assignment
CREATE TABLE public.admin_user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES public.admin_roles(id) ON DELETE CASCADE,
    
    -- Assignment metadata
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    assigned_by UUID REFERENCES public.admin_users(id),
    assignment_reason TEXT,
    ticket_id TEXT, -- Reference to support ticket
    approval_id UUID, -- Reference to approved request
    
    -- Temporary assignment (JIT)
    expires_at TIMESTAMPTZ,
    
    -- Constraints (ABAC)
    allowed_tenants UUID[], -- Can only access specific tenants
    allowed_regions TEXT[], -- Can only access specific regions
    
    UNIQUE(admin_user_id, role_id)
);

CREATE INDEX idx_user_roles_user ON public.admin_user_roles(admin_user_id);
CREATE INDEX idx_user_roles_permanent ON public.admin_user_roles(admin_user_id) WHERE expires_at IS NULL;
CREATE INDEX idx_user_roles_expires ON public.admin_user_roles(admin_user_id, expires_at);

-- =====================================================
-- 3. OWNER MANAGEMENT
-- =====================================================

CREATE TABLE public.owners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL UNIQUE REFERENCES public.admin_users(id) ON DELETE RESTRICT,
    
    -- Multi-owner configuration
    mode TEXT NOT NULL DEFAULT 'single' CHECK (mode IN ('single', 'multi')),
    m_of_n_config JSONB, -- {"m": 2, "n": 3} for multi-owner quorum
    
    -- Emergency contacts
    emergency_email TEXT,
    security_paging_channel TEXT, -- Slack/PagerDuty webhook
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    transferred_from UUID REFERENCES public.owners(id), -- Ownership transfer history
    transferred_at TIMESTAMPTZ
);

CREATE INDEX idx_owners_active ON public.owners(admin_user_id) WHERE transferred_at IS NULL;

COMMENT ON TABLE public.owners IS 'Platform owners with highest privileges but constrained access';

-- Owner escalation requests (JIT access to sensitive data)
CREATE TABLE public.owner_escalation_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.owners(id),
    requested_role TEXT NOT NULL, -- e.g., 'owner_escalated_moderation'
    reason TEXT NOT NULL,
    ticket_id TEXT NOT NULL,
    
    -- Approval
    requires_approval BOOLEAN DEFAULT true,
    approval_id UUID,
    
    -- Grant window
    granted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    auto_revoked_at TIMESTAMPTZ,
    
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- 4. SESSIONS & TOKENS
-- =====================================================

CREATE TABLE public.admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
    
    -- Session data
    access_token_jti TEXT NOT NULL UNIQUE, -- JWT ID
    refresh_token_jti TEXT UNIQUE,
    
    -- Context
    ip_address INET NOT NULL,
    user_agent TEXT,
    device_id TEXT,
    device_fingerprint TEXT,
    geo_country TEXT,
    geo_city TEXT,
    
    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Revocation
    revoked BOOLEAN DEFAULT false,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES public.admin_users(id),
    revoke_reason TEXT
);

CREATE INDEX idx_admin_sessions_user ON public.admin_sessions(admin_user_id, expires_at DESC) WHERE NOT revoked;
CREATE INDEX idx_admin_sessions_jti ON public.admin_sessions(access_token_jti) WHERE NOT revoked;

-- =====================================================
-- 5. AUDIT LOG (Append-only with Hash Chain)
-- =====================================================

CREATE TABLE public.admin_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence_number BIGSERIAL UNIQUE, -- Monotonic sequence
    
    -- Actor
    actor_type TEXT NOT NULL CHECK (actor_type IN ('admin', 'owner', 'system', 'automation')),
    actor_id UUID, -- admin_user_id or system identifier
    actor_role TEXT,
    actor_session_id UUID,
    
    -- Action
    action TEXT NOT NULL, -- e.g., 'user.ban'
    resource_type TEXT NOT NULL, -- e.g., 'user'
    resource_id TEXT, -- Can be UUID or composite
    
    -- Context
    severity TEXT NOT NULL CHECK (severity IN ('SEV0', 'SEV1', 'SEV2', 'SEV3', 'SEV4')),
    reason_code TEXT,
    reason_description TEXT,
    ticket_id TEXT,
    approval_id UUID,
    
    -- Request metadata
    request_id UUID NOT NULL,
    ip_address INET,
    user_agent TEXT,
    
    -- Result
    status TEXT NOT NULL CHECK (status IN ('success', 'failure', 'denied')),
    error_code TEXT,
    error_message TEXT,
    
    -- Data (sanitized, no PII)
    before_state JSONB, -- Masked
    after_state JSONB, -- Masked
    metadata JSONB,
    
    -- Hash chain (tamper-evident)
    hash_prev TEXT, -- SHA-256 hash of previous event
    hash_self TEXT NOT NULL, -- SHA-256 hash of this event
    hash_anchor_id UUID, -- Periodic anchor to immutable storage
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_audit_actor ON public.admin_audit_events(actor_id, created_at DESC);
CREATE INDEX idx_audit_resource ON public.admin_audit_events(resource_type, resource_id, created_at DESC);
CREATE INDEX idx_audit_severity ON public.admin_audit_events(severity, created_at DESC);
CREATE INDEX idx_audit_sequence ON public.admin_audit_events(sequence_number DESC);
CREATE INDEX idx_audit_request ON public.admin_audit_events(request_id);

-- No UPDATE/DELETE allowed
ALTER TABLE public.admin_audit_events ENABLE ROW LEVEL SECURITY;

-- Strictly restrict audit access to service_role (admin-api only).
DROP POLICY IF EXISTS "Audit events are append-only" ON public.admin_audit_events;

CREATE POLICY "service_role can read audit events" ON public.admin_audit_events
    FOR SELECT
    USING (auth.role() = 'service_role');

CREATE POLICY "service_role can insert audit events" ON public.admin_audit_events
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.admin_audit_events IS 'Immutable audit log with hash chain for tamper detection';

-- Audit hash anchors (periodic snapshots to immutable storage)
CREATE TABLE public.audit_hash_anchors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence_from BIGINT NOT NULL,
    sequence_to BIGINT NOT NULL,
    root_hash TEXT NOT NULL, -- Merkle root of event hashes
    anchor_storage_url TEXT, -- S3/IPFS URL of signed backup
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- 6. APPROVAL WORKFLOWS (4-eyes, M-of-N)
-- =====================================================

CREATE TABLE public.approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Operation details
    operation_type TEXT NOT NULL, -- e.g., 'user.ban', 'export.user_data'
    operation_description TEXT NOT NULL,
    operation_payload JSONB NOT NULL,
    
    -- Requestor
    requested_by UUID NOT NULL REFERENCES public.admin_users(id),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    request_reason TEXT NOT NULL,
    ticket_id TEXT,
    
    -- Approval requirements
    required_approvers INT NOT NULL DEFAULT 1,
    approver_roles TEXT[], -- Array of role names that can approve
    approver_constraints JSONB, -- e.g., {"exclude_same_team": true}
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'executed', 'failed')),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
    
    -- Execution
    executed_at TIMESTAMPTZ,
    executed_by UUID REFERENCES public.admin_users(id),
    execution_result JSONB,
    execution_error TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_approvals_status ON public.approvals(status, created_at DESC);
CREATE INDEX idx_approvals_requester ON public.approvals(requested_by);

-- Individual approval steps
CREATE TABLE public.approval_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_id UUID NOT NULL REFERENCES public.approvals(id) ON DELETE CASCADE,
    
    -- Approver
    approver_id UUID NOT NULL REFERENCES public.admin_users(id),
    approver_role TEXT NOT NULL,
    
    -- Decision
    decision TEXT NOT NULL CHECK (decision IN ('approved', 'denied')),
    decision_reason TEXT,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Context
    ip_address INET,
    signature TEXT, -- Cryptographic signature (optional)
    
    UNIQUE(approval_id, approver_id)
);

CREATE INDEX idx_approval_steps_approval ON public.approval_steps(approval_id);

-- =====================================================
-- 7. POLICIES (ABAC Rules)
-- =====================================================

CREATE TABLE public.admin_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    
    -- Policy definition
    resource TEXT NOT NULL, -- e.g., 'users'
    action TEXT NOT NULL, -- e.g., 'ban'
    
    -- Requirements
    required_permissions TEXT[] NOT NULL,
    required_roles TEXT[],
    
    -- Conditions (ABAC)
    conditions JSONB NOT NULL, -- {"AND": [...constraints...]}
    
    -- Rate limiting
    rate_limit TEXT, -- e.g., '10/hour', '100/day'
    max_batch_size INT,
    
    -- Workflow
    requires_approval BOOLEAN DEFAULT false,
    required_approvers INT DEFAULT 1,
    requires_ticket BOOLEAN DEFAULT false,
    requires_reason BOOLEAN DEFAULT true,
    
    -- Audit
    audit_severity TEXT NOT NULL CHECK (audit_severity IN ('SEV0', 'SEV1', 'SEV2', 'SEV3', 'SEV4')),
    post_action_review BOOLEAN DEFAULT false,
    
    -- Status
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES public.admin_users(id)
);

CREATE INDEX idx_policies_resource_action ON public.admin_policies(resource, action) WHERE enabled;

COMMENT ON TABLE public.admin_policies IS 'ABAC policy rules for fine-grained access control';

-- =====================================================
-- 8. MODERATION DOMAIN
-- =====================================================

-- Report queue (user-generated reports)
CREATE TABLE public.moderation_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Report source
    reporter_id UUID, -- Can be NULL for anonymous reports
    report_type TEXT NOT NULL CHECK (report_type IN ('spam', 'fraud', 'harassment', 'violence', 'csam', 'terrorism', 'hate_speech', 'impersonation', 'other')),
    
    -- Target
    reported_entity_type TEXT NOT NULL CHECK (reported_entity_type IN ('user', 'message', 'channel', 'group', 'post', 'comment')),
    reported_entity_id UUID NOT NULL,
    reported_user_id UUID, -- User who owns the entity
    
    -- Report details
    description TEXT,
    evidence_urls TEXT[], -- Screenshots, links
    
    -- Triage
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'investigating', 'resolved', 'dismissed')),
    
    -- Assignment
    assigned_to UUID REFERENCES public.admin_users(id),
    assigned_at TIMESTAMPTZ,
    
    -- Resolution
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES public.admin_users(id),
    resolution_action TEXT,
    resolution_notes TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_moderation_reports_status ON public.moderation_reports(status, priority DESC, created_at DESC);
CREATE INDEX idx_moderation_reports_target ON public.moderation_reports(reported_entity_type, reported_entity_id);
CREATE INDEX idx_moderation_reports_assignee ON public.moderation_reports(assigned_to) WHERE status = 'assigned';

-- Moderation cases (aggregated, long-running investigations)
CREATE TABLE public.moderation_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_number TEXT NOT NULL UNIQUE, -- Human-readable: MC-2024-0001
    
    -- Case details
    title TEXT NOT NULL,
    case_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    
    -- Target
    subject_user_id UUID,
    subject_type TEXT,
    
    -- Investigation
    lead_investigator UUID REFERENCES public.admin_users(id),
    team_members UUID[],
    
    -- Evidence
    related_reports UUID[], -- Array of moderation_report IDs
    evidence JSONB[], -- [{type, url, description, collected_at}]
    timeline JSONB[], -- [{timestamp, event, actor}]
    
    -- Status
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'pending_decision', 'resolved', 'closed')),
    
    -- Resolution
    final_decision TEXT,
    enforcement_actions TEXT[],
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES public.admin_users(id),
    
    -- Appeal
    appeal_allowed BOOLEAN DEFAULT true,
    appealed_at TIMESTAMPTZ,
    appeal_status TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_moderation_cases_status ON public.moderation_cases(status, severity DESC, created_at DESC);
CREATE INDEX idx_moderation_cases_lead ON public.moderation_cases(lead_investigator);

-- Enforcement actions (bans, restrictions, etc)
CREATE TABLE public.moderation_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Action details
    action_type TEXT NOT NULL CHECK (action_type IN ('warn', 'mute', 'restrict', 'shadowban', 'suspend', 'ban', 'content_remove')),
    target_user_id UUID NOT NULL,
    
    -- Context
    reason_code TEXT NOT NULL,
    reason_description TEXT NOT NULL,
    case_id UUID REFERENCES public.moderation_cases(id),
    ticket_id TEXT,
    
    -- Actor
    actioned_by UUID NOT NULL REFERENCES public.admin_users(id),
    approval_id UUID REFERENCES public.approvals(id),
    
    -- Duration
    effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ, -- NULL = permanent
    
    -- Status
    active BOOLEAN DEFAULT true,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES public.admin_users(id),
    revoke_reason TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_moderation_actions_target ON public.moderation_actions(target_user_id, active);
CREATE INDEX idx_moderation_actions_type ON public.moderation_actions(action_type, active);

COMMENT ON TABLE public.moderation_actions IS 'Enforcement actions against users/content';

-- =====================================================
-- CONTINUED IN PART 2...
-- =====================================================
