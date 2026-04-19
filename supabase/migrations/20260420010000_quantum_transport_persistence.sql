-- =============================================================================
-- Quantum Transport Persistence
-- Production persistence for time bank and meta-cognition telemetry.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.nav_time_bank_accounts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_minutes INTEGER NOT NULL DEFAULT 0 CHECK (balance_minutes >= 0),
  total_saved_minutes INTEGER NOT NULL DEFAULT 0 CHECK (total_saved_minutes >= 0),
  total_spent_minutes INTEGER NOT NULL DEFAULT 0 CHECK (total_spent_minutes >= 0),
  monthly_trend INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nav_time_bank_accounts_updated_at
  ON public.nav_time_bank_accounts(updated_at DESC);

ALTER TABLE public.nav_time_bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nav_time_bank_accounts_own" ON public.nav_time_bank_accounts;
CREATE POLICY "nav_time_bank_accounts_own"
  ON public.nav_time_bank_accounts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.nav_time_bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('earned', 'spent', 'invested', 'gifted')),
  minutes INTEGER NOT NULL CHECK (minutes >= 0),
  description TEXT NOT NULL,
  route_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nav_time_bank_transactions_user_created
  ON public.nav_time_bank_transactions(user_id, created_at DESC);

ALTER TABLE public.nav_time_bank_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nav_time_bank_transactions_own" ON public.nav_time_bank_transactions;
CREATE POLICY "nav_time_bank_transactions_own"
  ON public.nav_time_bank_transactions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.nav_meta_cognition_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  success BOOLEAN NOT NULL DEFAULT true,
  error_type TEXT,
  feedback TEXT CHECK (feedback IN ('positive', 'negative', 'neutral')),
  context JSONB NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'navigation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nav_meta_cognition_events_user_occurred
  ON public.nav_meta_cognition_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_meta_cognition_events_feedback
  ON public.nav_meta_cognition_events(user_id, feedback)
  WHERE feedback IS NOT NULL;

ALTER TABLE public.nav_meta_cognition_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nav_meta_cognition_events_own" ON public.nav_meta_cognition_events;
CREATE POLICY "nav_meta_cognition_events_own"
  ON public.nav_meta_cognition_events
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.nav_meta_cognition_remediations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed', 'testing', 'deployed', 'reverted')),
  impact TEXT NOT NULL,
  deployed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nav_meta_cognition_remediations_user_created
  ON public.nav_meta_cognition_remediations(user_id, created_at DESC);

ALTER TABLE public.nav_meta_cognition_remediations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nav_meta_cognition_remediations_own" ON public.nav_meta_cognition_remediations;
CREATE POLICY "nav_meta_cognition_remediations_own"
  ON public.nav_meta_cognition_remediations
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());