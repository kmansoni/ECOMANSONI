-- ============================================================
-- Batch 3: Collectible Usernames marketplace
-- ============================================================

CREATE TABLE public.collectible_usernames (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  price_stars INT NOT NULL DEFAULT 0, -- 0 = ÃÂ½ÃÂµ ÃÂ¿ÃÃÂ¾ÃÂ´ÃÂ°ÃÃÃÃ±
  is_for_sale BOOLEAN DEFAULT FALSE,
  category TEXT DEFAULT 'standard' CHECK (category IN ('standard', 'rare', 'legendary', 'og')),
  purchased_at TIMESTAMPTZ,
  listed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ÃÃÃÃoÃÃÂ¸Ã ÃÃÃÂ°ÃÂ½ÃÂ·ÃÂ°ÃÂºÃÃÂ¸ÃÂ¹
CREATE TABLE public.username_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username_id UUID NOT NULL REFERENCES public.collectible_usernames(id),
  seller_id UUID REFERENCES auth.users(id),
  buyer_id UUID NOT NULL REFERENCES auth.users(id),
  price_stars INT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'auction_win', 'transfer')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_collectible_usernames_sale ON public.collectible_usernames(is_for_sale, price_stars) WHERE is_for_sale = TRUE;
CREATE INDEX idx_collectible_usernames_owner ON public.collectible_usernames(owner_id);
CREATE INDEX idx_username_transactions_buyer ON public.username_transactions(buyer_id, created_at DESC);

ALTER TABLE public.collectible_usernames ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.username_transactions ENABLE ROW LEVEL SECURITY;

-- collectible_usernames: ÃÂ²ÃÃÂµ ÃÂ²ÃÂ¸ÃÂ´ÃÃ ÃÂ´ÃÂ»Ã ÃÂ¿ÃÃÂ¾ÃÂ´ÃÂ°ÃÂ¶ÃÂ¸; ÃÂ²ÃÂ»ÃÂ°ÃÂ´ÃÂµÃÂ»ÃÂµÃ ÃÃÂ¿ÃÃÂ°ÃÂ²ÃÂ»ÃÃÂµÃ
CREATE POLICY "cu_select" ON public.collectible_usernames
  FOR SELECT USING (is_for_sale = TRUE OR owner_id = auth.uid());
CREATE POLICY "cu_update_owner" ON public.collectible_usernames
  FOR UPDATE USING (owner_id = auth.uid());
-- INSERT/ÃÂ¿ÃÂ¾ÃÂºÃÃÂ¿ÃÂºÃÂ° ÃÃÂ¾ÃÂ»ÃÃÂºÃÂ¾ ÃÃÂµÃÃÂµÃÂ· service_role (Edge Function)

-- username_transactions: ÃÃÃÂ°ÃÃÃÂ½ÃÂ¸ÃÂºÃÂ¸ ÃÂ²ÃÂ¸ÃÂ´ÃÃ ÃÃÂ²ÃÂ¾ÃÂ¸
CREATE POLICY "ut_select" ON public.username_transactions
  FOR SELECT USING (buyer_id = auth.uid() OR seller_id = auth.uid());
-- INSERT ÃÃÂ¾ÃÂ»ÃÃÂºÃÂ¾ service_role
