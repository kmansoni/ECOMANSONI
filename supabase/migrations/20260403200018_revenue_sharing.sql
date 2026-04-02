-- ============================================================================
-- Revenue Sharing — доходы от контента и выплаты
-- ============================================================================

CREATE TABLE IF NOT EXISTS creator_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL
    CHECK (source IN ('ad_revenue', 'subscription', 'tip', 'bonus', 'referral')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  description TEXT,
  post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paid', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 1000),
  method TEXT NOT NULL
    CHECK (method IN ('bank_transfer', 'paypal', 'crypto')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
  payout_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_creator_earnings_creator
  ON creator_earnings(creator_id);

CREATE INDEX IF NOT EXISTS idx_creator_earnings_status
  ON creator_earnings(status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_payout_requests_creator
  ON payout_requests(creator_id);

-- RLS
ALTER TABLE creator_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creator_earnings_select_own"
  ON creator_earnings FOR SELECT
  USING (auth.uid() = creator_id);

CREATE POLICY "creator_earnings_insert_own"
  ON creator_earnings FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "payout_requests_select_own"
  ON payout_requests FOR SELECT
  USING (auth.uid() = creator_id);

CREATE POLICY "payout_requests_insert_own"
  ON payout_requests FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "payout_requests_update_own"
  ON payout_requests FOR UPDATE
  USING (auth.uid() = creator_id);
