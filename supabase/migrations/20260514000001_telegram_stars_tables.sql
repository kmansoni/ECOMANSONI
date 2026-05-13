-- Telegram Stars Payment Infrastructure
-- Tables for XTR currency, subscriptions, gifts, and transactions

-- User Stars Balance
CREATE TABLE IF NOT EXISTS public.user_stars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stars Transactions
CREATE TABLE IF NOT EXISTS public.star_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('purchase', 'gift_sent', 'gift_received', 'refund', 'subscription', 'spent')),
  amount INTEGER NOT NULL,
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  description TEXT,
  reference_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stars Subscriptions
CREATE TABLE IF NOT EXISTS public.stars_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  product_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'expired', 'pending')) DEFAULT 'pending',
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  auto_renew BOOLEAN NOT NULL DEFAULT true,
  telegram_payment_charge_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stars Gifts
CREATE TABLE IF NOT EXISTS public.stars_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  to_username TEXT,
  amount INTEGER NOT NULL,
  message TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'claimed', 'expired')) DEFAULT 'sent',
  gift_code TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ
);

-- Stars Revenue Sharing
CREATE TABLE IF NOT EXISTS public.stars_revenue_share (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  transaction_id UUID REFERENCES star_transactions(id),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stars Audit Log
CREATE TABLE IF NOT EXISTS public.stars_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  performed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_star_transactions_user_id ON public.star_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_star_transactions_created_at ON public.star_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stars_subscriptions_user_id ON public.stars_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_stars_gifts_from_user_id ON public.stars_gifts(from_user_id);
CREATE INDEX IF NOT EXISTS idx_stars_gifts_to_user_id ON public.stars_gifts(to_user_id);
CREATE INDEX IF NOT EXISTS idx_stars_gifts_gift_code ON public.stars_gifts(gift_code);

-- RLS Policies
ALTER TABLE public.user_stars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.star_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stars_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stars_gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stars_revenue_share ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stars_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own stars balance" ON public.user_stars
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own transactions" ON public.star_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own subscriptions" ON public.stars_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view sent gifts" ON public.stars_gifts
  FOR SELECT USING (auth.uid() = from_user_id);

CREATE POLICY "Users can view received gifts" ON public.stars_gifts
  FOR SELECT USING (auth.uid() = to_user_id);

CREATE POLICY "Service role full access on stars" ON public.user_stars
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on transactions" ON public.star_transactions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on subscriptions" ON public.stars_subscriptions
  FOR ALL USING (auth.role() = 'service_role');

-- RPC Function for atomic balance updates
CREATE OR REPLACE FUNCTION update_stars_balance(
    p_user_id UUID,
    p_amount INTEGER,
    p_type TEXT
) RETURNS INTEGER AS $$
DECLARE
    new_balance INTEGER;
BEGIN
    IF p_type = 'credit' THEN
        INSERT INTO user_stars (user_id, balance)
        VALUES (p_user_id, p_amount)
        ON CONFLICT (user_id)
        DO UPDATE SET balance = user_stars.balance + p_amount, updated_at = now()
        RETURNING balance INTO new_balance;
    ELSIF p_type = 'debit' THEN
        UPDATE user_stars
        SET balance = balance - p_amount, updated_at = now()
        WHERE user_id = p_user_id AND balance >= p_amount
        RETURNING balance INTO new_balance;
    END IF;
    RETURN new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;