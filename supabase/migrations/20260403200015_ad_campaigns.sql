-- ============================================================================
-- Ad Campaigns — рекламный кабинет
-- ============================================================================

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'review', 'active', 'paused', 'completed', 'rejected')),
  objective TEXT NOT NULL
    CHECK (objective IN ('reach', 'engagement', 'traffic', 'conversions')),
  budget_cents INTEGER NOT NULL CHECK (budget_cents > 0),
  spent_cents INTEGER NOT NULL DEFAULT 0 CHECK (spent_cents >= 0),
  daily_budget_cents INTEGER CHECK (daily_budget_cents IS NULL OR daily_budget_cents > 0),
  start_date DATE NOT NULL,
  end_date DATE,
  targeting JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('image', 'video', 'carousel', 'story')),
  media_url TEXT NOT NULL,
  headline TEXT NOT NULL CHECK (char_length(headline) BETWEEN 1 AND 100),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 300),
  call_to_action TEXT NOT NULL
    CHECK (call_to_action IN ('learn_more', 'shop_now', 'sign_up', 'contact_us', 'download')),
  destination_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_impressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id UUID NOT NULL REFERENCES ad_creatives(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL CHECK (action IN ('impression', 'click', 'conversion')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_advertiser
  ON ad_campaigns(advertiser_id);

CREATE INDEX IF NOT EXISTS idx_ad_creatives_campaign
  ON ad_creatives(campaign_id);

CREATE INDEX IF NOT EXISTS idx_ad_impressions_creative
  ON ad_impressions(creative_id);

CREATE INDEX IF NOT EXISTS idx_ad_impressions_date
  ON ad_impressions(created_at);

-- RLS
ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_impressions ENABLE ROW LEVEL SECURITY;

-- ad_campaigns: владелец управляет своими кампаниями
CREATE POLICY "ad_campaigns_select_own"
  ON ad_campaigns FOR SELECT
  USING (auth.uid() = advertiser_id);

CREATE POLICY "ad_campaigns_insert_own"
  ON ad_campaigns FOR INSERT
  WITH CHECK (auth.uid() = advertiser_id);

CREATE POLICY "ad_campaigns_update_own"
  ON ad_campaigns FOR UPDATE
  USING (auth.uid() = advertiser_id);

CREATE POLICY "ad_campaigns_delete_own"
  ON ad_campaigns FOR DELETE
  USING (auth.uid() = advertiser_id);

-- ad_creatives: рекламодатель через кампанию
CREATE POLICY "ad_creatives_select_own"
  ON ad_creatives FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ad_campaigns
      WHERE id = ad_creatives.campaign_id
        AND advertiser_id = auth.uid()
    )
  );

CREATE POLICY "ad_creatives_insert_own"
  ON ad_creatives FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ad_campaigns
      WHERE id = ad_creatives.campaign_id
        AND advertiser_id = auth.uid()
    )
  );

CREATE POLICY "ad_creatives_update_own"
  ON ad_creatives FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM ad_campaigns
      WHERE id = ad_creatives.campaign_id
        AND advertiser_id = auth.uid()
    )
  );

CREATE POLICY "ad_creatives_delete_own"
  ON ad_creatives FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM ad_campaigns
      WHERE id = ad_creatives.campaign_id
        AND advertiser_id = auth.uid()
    )
  );

-- ad_impressions: вставка — любой авторизованный, чтение — рекламодатель
CREATE POLICY "ad_impressions_insert_any"
  ON ad_impressions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "ad_impressions_select_advertiser"
  ON ad_impressions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ad_creatives ac
      JOIN ad_campaigns camp ON ac.campaign_id = camp.id
      WHERE ac.id = ad_impressions.creative_id
        AND camp.advertiser_id = auth.uid()
    )
  );

-- Триггер updated_at для ad_campaigns
CREATE OR REPLACE FUNCTION update_ad_campaigns_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ad_campaigns_updated_at ON ad_campaigns;
CREATE TRIGGER trg_ad_campaigns_updated_at
  BEFORE UPDATE ON ad_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_ad_campaigns_updated_at();
