-- =====================================================
-- ADMIN CONSOLE - JIT SCHEMA ALIGNMENT
-- Aligns owner_escalation_requests/admin_user_roles with admin-api contract.
-- =====================================================

-- 1) owner_escalation_requests: add fields expected by admin-api JIT flow
ALTER TABLE public.owner_escalation_requests
  ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES public.admin_roles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approver_id UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 30;

-- Keep duration bounded to sane values for break-glass access.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'owner_escalation_requests_duration_minutes_check'
      AND conrelid = 'public.owner_escalation_requests'::regclass
  ) THEN
    ALTER TABLE public.owner_escalation_requests
      ADD CONSTRAINT owner_escalation_requests_duration_minutes_check
      CHECK (duration_minutes BETWEEN 1 AND 240);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_owner_escalation_requests_requested_by
  ON public.owner_escalation_requests(requested_by, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_owner_escalation_requests_role_id
  ON public.owner_escalation_requests(role_id);

CREATE INDEX IF NOT EXISTS idx_owner_escalation_requests_active
  ON public.owner_escalation_requests(approved_at, expires_at, revoked_at);

-- 2) admin_user_roles: explicit JIT linkage to prevent unsafe revokes
ALTER TABLE public.admin_user_roles
  ADD COLUMN IF NOT EXISTS jit_request_id UUID REFERENCES public.owner_escalation_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_admin_user_roles_jit_request_id
  ON public.admin_user_roles(jit_request_id);

-- 3) best-effort backfill for legacy rows (idempotent)
-- Map role_id/requested_by when old columns are populated.
UPDATE public.owner_escalation_requests o
SET role_id = ar.id
FROM public.admin_roles ar
WHERE o.role_id IS NULL
  AND o.requested_role IS NOT NULL
  AND ar.name = o.requested_role;

UPDATE public.owner_escalation_requests o
SET requested_by = ow.admin_user_id
FROM public.owners ow
WHERE o.requested_by IS NULL
  AND o.owner_id IS NOT NULL
  AND ow.id = o.owner_id;
