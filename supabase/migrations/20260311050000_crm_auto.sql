-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- ══════════════════════════════════════════════════════════════════════════════
-- CRM AUTO: Dealer/Seller CRM for automotive marketplace
--
-- Feature coverage (research-based):
--   auto.ru  — VIN history, marketplace syndication, call-tracking, trade-in
--   Avito    — multi-source leads, listing stats (views/favorites/contacts)
--   Drom.ru  — vehicle catalog, отзывы integration, спецтехника vertical
--   AutoTrader UK — instant valuation, online reservation, leasing, EV vertical
--   Cars.com — dealer rating, "deals near you", Best Cars awards
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── Vehicles (Inventory / Listings) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.auto_vehicles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identification
  vin             text,
  make            text NOT NULL,
  model           text NOT NULL,
  generation      text,
  year            integer NOT NULL,
  body_type       text,  -- sedan/hatchback/suv/crossover/coupe/wagon/minivan/pickup/van/truck/moto/special
  color           text,
  interior_color  text,

  -- Technical
  engine_volume   numeric(4,1),  -- litres
  engine_power    integer,        -- hp
  engine_type     text,           -- gasoline/diesel/hybrid/electric/lpg/hydrogen
  transmission    text,           -- manual/automatic/robot/variator
  drive           text,           -- fwd/rwd/4wd/awd
  mileage         integer,        -- km
  condition       text DEFAULT 'used',  -- new/used/damaged/parts

  -- Pricing
  price           integer NOT NULL,
  price_currency  text DEFAULT 'RUB',
  negotiable      boolean DEFAULT true,
  market_value    integer,         -- auto-calculated from valuation
  recommended_price integer,       -- algorithm recommendation
  price_history   jsonb DEFAULT '[]'::jsonb,  -- [{price, changed_at, reason}]

  -- Listing metadata
  status          text DEFAULT 'draft',  -- draft/active/paused/sold/archived/reserved
  listing_type    text DEFAULT 'sale',   -- sale/lease/parts/trade_in
  is_dealer       boolean DEFAULT false,
  dealer_id       text,
  seller_type     text DEFAULT 'private',  -- private/dealer/commission
  seller_rating   numeric(3,1),

  -- Media
  photos          jsonb DEFAULT '[]'::jsonb,      -- [{url, order, is_main}]
  video_url       text,
  panorama_url    text,
  photo_count     integer GENERATED ALWAYS AS (jsonb_array_length(photos)) STORED,

  -- Description
  description     text,
  equipment       jsonb DEFAULT '[]'::jsonb,  -- option codes / feature list
  defects         jsonb DEFAULT '[]'::jsonb,  -- [{location, severity, description}]

  -- Geo
  city            text,
  region          text,
  lat             numeric(9,6),
  lng             numeric(9,6),

  -- Stats (from marketplace syndication)
  views_total     integer DEFAULT 0,
  contacts_total  integer DEFAULT 0,
  favorites_total integer DEFAULT 0,
  calls_total     integer DEFAULT 0,
  days_on_market  integer DEFAULT 0,
  last_bumped_at  timestamptz,

  -- Marketplace syndication
  published_to    jsonb DEFAULT '[]'::jsonb,  -- [{source, listing_id, url, published_at, promo_package}]

  -- Promotion
  promo_package   text,   -- free/standard/premium/vip/top
  promo_until     timestamptz,
  promo_spent     integer DEFAULT 0,

  -- Finance
  credit_available    boolean DEFAULT false,
  leasing_available   boolean DEFAULT false,
  monthly_payment_min integer,  -- estimated min monthly (leasing/credit)
  trade_in_accepted   boolean DEFAULT true,

  -- Special verticals
  vehicle_category  text DEFAULT 'car',  -- car/moto/commercial/special_equipment/parts/accessory
  is_electric       boolean DEFAULT false,
  range_km          integer,  -- EV range

  -- VIN data
  vin_checked       boolean DEFAULT false,
  vin_check_result  jsonb,   -- {accidents, owners, mileage_history, restrictions, wanted}
  vin_checked_at    timestamptz,

  -- Online deal
  reserve_online    boolean DEFAULT false,
  reserve_deposit   integer,  -- amount in RUB
  reserved_by       uuid REFERENCES auth.users(id),
  reserved_at       timestamptz,
  reserve_expires   timestamptz,

  -- Trade-in
  is_trade_in_proposal  boolean DEFAULT false,
  trade_in_from_vehicle uuid REFERENCES crm.auto_vehicles(id),

  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),

  CONSTRAINT valid_year CHECK (year BETWEEN 1900 AND 2030),
  CONSTRAINT valid_mileage CHECK (mileage >= 0),
  CONSTRAINT valid_price CHECK (price > 0)
);

-- ─── Leads (Incoming inquiries from all sources) ───────────────────────────
CREATE TABLE IF NOT EXISTS crm.auto_leads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id      uuid REFERENCES crm.auto_vehicles(id) ON DELETE SET NULL,

  -- Contact info
  name            text,
  phone           text,
  email           text,
  city            text,

  -- Source tracking
  source          text DEFAULT 'direct',  -- auto_ru/avito/drom/website/walk_in/referral/call/whatsapp/telegram/instagram
  source_listing_id text,  -- external ad ID
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,

  -- Lead details
  stage           text DEFAULT 'new',  -- new/contacted/test_drive/negotiation/deal/lost/duplicate
  contact_type    text DEFAULT 'unknown', -- call/message/email/walk_in/online_form/chat
  message         text,

  -- Intent signals
  buying_timeframe text,   -- today/this_week/this_month/exploring
  budget_min      integer,
  budget_max      integer,
  preferred_makes jsonb DEFAULT '[]'::jsonb,
  preferred_bodies jsonb DEFAULT '[]'::jsonb,
  finance_needed  boolean,

  -- CRM tracking
  assigned_to     text,    -- manager name
  priority        text DEFAULT 'normal',   -- hot/high/normal/low
  next_contact_at timestamptz,
  contacted_at    timestamptz,
  last_activity_at timestamptz DEFAULT now(),

  -- Outcome
  lost_reason     text,  -- price/competitor/no_budget/bought_elsewhere/no_response/duplicate
  deal_id         uuid,  -- → crm.auto_deals
  notes           text,

  -- Duplicate detection
  duplicate_of    uuid REFERENCES crm.auto_leads(id),

  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ─── Deals ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.auto_deals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id      uuid REFERENCES crm.auto_vehicles(id) ON DELETE SET NULL,
  lead_id         uuid REFERENCES crm.auto_leads(id) ON DELETE SET NULL,

  -- Deal info
  stage           text DEFAULT 'interest',
    -- interest/inspection/credit_check/docs_prep/signing/delivery/completed/cancelled
  sale_price      integer NOT NULL,
  discount        integer DEFAULT 0,
  final_price     integer GENERATED ALWAYS AS (sale_price - discount) STORED,

  -- Payment
  payment_method  text,   -- cash/credit/leasing/trade_in/mixed
  credit_bank     text,
  credit_term_months integer,
  credit_rate     numeric(5,2),
  monthly_payment integer,
  down_payment    integer,
  trade_in_vehicle_id uuid REFERENCES crm.auto_vehicles(id),
  trade_in_value  integer,

  -- Timeline
  deal_date       date,
  delivery_date   date,
  signing_date    date,

  -- Docs checklist (like HRlink КЭДО for HR)
  docs_checklist  jsonb DEFAULT '[]'::jsonb,
  -- [{type: "passport"|"sts"|"pts"|"osago"|"kasko"|"loan_agreement"|"sale_contract"|"act_of_delivery",
  --   status: "pending"|"collected"|"verified"|"signed", completed_at}]

  -- Profit
  purchase_price  integer,  -- what dealer paid for this car
  gross_profit    integer GENERATED ALWAYS AS (sale_price - discount - COALESCE(purchase_price, 0)) STORED,

  notes           text,
  cancelled_reason text,

  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ─── Valuations (Price estimation engine — AutoTrader "Value your car") ───
CREATE TABLE IF NOT EXISTS crm.auto_valuations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id      uuid REFERENCES crm.auto_vehicles(id) ON DELETE CASCADE,

  -- Input parameters
  make            text NOT NULL,
  model           text NOT NULL,
  year            integer NOT NULL,
  mileage         integer NOT NULL,
  condition       text NOT NULL,   -- excellent/good/fair/poor
  engine_volume   numeric(4,1),
  transmission    text,
  color           text,
  city            text,

  -- Valuation result
  value_min       integer NOT NULL,
  value_mid       integer NOT NULL,
  value_max       integer NOT NULL,
  confidence_pct  integer,   -- 0-100
  method          text DEFAULT 'market_comparison',  -- market_comparison/ml_model/manual

  -- Market context
  comparable_count   integer,   -- how many similar listings found
  avg_market_price   integer,
  median_market_price integer,
  days_avg_sell      integer,   -- avg days to sell similar

  -- Recommendation
  recommended_price  integer,
  price_position     text,  -- underpriced/fair/overpriced
  market_trend       text,  -- rising/stable/falling

  notes           text,
  valid_until     timestamptz DEFAULT (now() + interval '7 days'),
  created_at      timestamptz DEFAULT now()
);

-- ─── Test Drives ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.auto_test_drives (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id      uuid REFERENCES crm.auto_vehicles(id) ON DELETE SET NULL,
  lead_id         uuid REFERENCES crm.auto_leads(id) ON DELETE SET NULL,

  -- Client
  client_name     text NOT NULL,
  client_phone    text,

  -- Schedule
  scheduled_at    timestamptz NOT NULL,
  duration_min    integer DEFAULT 30,
  location        text DEFAULT 'showroom',  -- showroom/delivery/online

  -- Status
  status          text DEFAULT 'scheduled',  -- scheduled/completed/cancelled/no_show/rescheduled
  manager         text,

  -- Outcome
  result          text,   -- interested/not_interested/needs_time/offer_made
  notes           text,
  feedback        text,

  reminder_sent   boolean DEFAULT false,
  reminder_at     timestamptz,

  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ─── Online Reservations (AutoTrader "Reserve online") ────────────────────
CREATE TABLE IF NOT EXISTS crm.auto_reservations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id      uuid NOT NULL REFERENCES crm.auto_vehicles(id) ON DELETE CASCADE,

  -- Buyer
  buyer_name      text NOT NULL,
  buyer_phone     text NOT NULL,
  buyer_email     text,

  -- Reservation
  deposit_amount  integer NOT NULL DEFAULT 5000,
  deposit_paid    boolean DEFAULT false,
  deposit_paid_at timestamptz,
  payment_method  text DEFAULT 'card',

  -- Status
  status          text DEFAULT 'pending',  -- pending/confirmed/cancelled/converted_to_deal/expired
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  confirmed_at    timestamptz,
  cancelled_at    timestamptz,
  cancel_reason   text,

  notes           text,
  created_at      timestamptz DEFAULT now()
);

-- ─── Lead contact timeline ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.auto_lead_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id     uuid NOT NULL REFERENCES crm.auto_leads(id) ON DELETE CASCADE,

  event_type  text NOT NULL,  -- call/sms/email/message/note/stage_change/test_drive/offer
  direction   text,           -- inbound/outbound
  content     text,
  result      text,           -- answered/missed/callback/interested/not_interested
  duration_sec integer,       -- for calls
  manager     text,

  created_at  timestamptz DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_auto_vehicles_user ON crm.auto_vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_vehicles_status ON crm.auto_vehicles(status);
CREATE INDEX IF NOT EXISTS idx_auto_vehicles_make_model ON crm.auto_vehicles(make, model);
CREATE INDEX IF NOT EXISTS idx_auto_vehicles_price ON crm.auto_vehicles(price);
CREATE INDEX IF NOT EXISTS idx_auto_vehicles_category ON crm.auto_vehicles(vehicle_category);
CREATE INDEX IF NOT EXISTS idx_auto_leads_user ON crm.auto_leads(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_leads_stage ON crm.auto_leads(stage);
CREATE INDEX IF NOT EXISTS idx_auto_leads_vehicle ON crm.auto_leads(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_auto_deals_user ON crm.auto_deals(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_deals_vehicle ON crm.auto_deals(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_auto_test_drives_user ON crm.auto_test_drives(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_test_drives_scheduled ON crm.auto_test_drives(scheduled_at);

-- ─── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE crm.auto_vehicles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.auto_leads        ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.auto_deals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.auto_valuations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.auto_test_drives  ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.auto_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.auto_lead_events  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "auto_vehicles_owner" ON crm.auto_vehicles
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auto_leads_owner" ON crm.auto_leads
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auto_deals_owner" ON crm.auto_deals
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auto_valuations_owner" ON crm.auto_valuations
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auto_test_drives_owner" ON crm.auto_test_drives
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auto_reservations_owner" ON crm.auto_reservations
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auto_lead_events_owner" ON crm.auto_lead_events
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── RPC: Dashboard stats ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.get_auto_dashboard_stats()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = crm, public
AS $$
  SELECT jsonb_build_object(
    'total_vehicles',       COUNT(*)                                               FILTER (WHERE status NOT IN ('archived','sold')),
    'active_listings',      COUNT(*)                                               FILTER (WHERE status = 'active'),
    'draft_listings',       COUNT(*)                                               FILTER (WHERE status = 'draft'),
    'reserved',             COUNT(*)                                               FILTER (WHERE status = 'reserved'),
    'sold_this_month',      COUNT(*)                                               FILTER (WHERE status = 'sold' AND updated_at >= date_trunc('month', now())),
    'total_views',          COALESCE(SUM(views_total), 0),
    'total_contacts',       COALESCE(SUM(contacts_total), 0),
    'avg_days_on_market',   ROUND(AVG(days_on_market) FILTER (WHERE status = 'active'))::int,
    'total_new_leads',      (SELECT COUNT(*) FROM crm.auto_leads WHERE user_id = auth.uid() AND stage = 'new'),
    'leads_this_week',      (SELECT COUNT(*) FROM crm.auto_leads WHERE user_id = auth.uid() AND created_at >= now() - interval '7 days'),
    'hot_leads',            (SELECT COUNT(*) FROM crm.auto_leads WHERE user_id = auth.uid() AND priority = 'hot' AND stage NOT IN ('deal','lost')),
    'test_drives_today',    (SELECT COUNT(*) FROM crm.auto_test_drives WHERE user_id = auth.uid() AND scheduled_at::date = CURRENT_DATE AND status = 'scheduled'),
    'deals_this_month',     (SELECT COUNT(*) FROM crm.auto_deals WHERE user_id = auth.uid() AND created_at >= date_trunc('month', now())),
    'revenue_this_month',   (SELECT COALESCE(SUM(final_price), 0) FROM crm.auto_deals WHERE user_id = auth.uid() AND created_at >= date_trunc('month', now())),
    'avg_sale_price',       (SELECT ROUND(AVG(final_price))::int FROM crm.auto_deals WHERE user_id = auth.uid())
  )
  FROM crm.auto_vehicles
  WHERE user_id = auth.uid()
$$;

-- ─── RPC: Get vehicles ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.get_auto_vehicles(
  p_status text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_make text DEFAULT NULL
)
RETURNS SETOF crm.auto_vehicles
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = crm, public
AS $$
  SELECT * FROM crm.auto_vehicles
  WHERE user_id = auth.uid()
    AND (p_status IS NULL   OR status = p_status)
    AND (p_category IS NULL OR vehicle_category = p_category)
    AND (p_make IS NULL     OR make ILIKE '%' || p_make || '%')
  ORDER BY
    CASE status
      WHEN 'reserved' THEN 1
      WHEN 'active' THEN 2
      WHEN 'draft' THEN 3
      WHEN 'paused' THEN 4
      ELSE 5
    END,
    updated_at DESC
$$;

-- ─── RPC: Upsert vehicle ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.upsert_auto_vehicle(
  p_id              uuid,
  p_make            text,
  p_model           text,
  p_year            integer,
  p_mileage         integer,
  p_price           integer,
  p_condition       text,
  p_engine_volume   numeric,
  p_engine_type     text,
  p_transmission    text,
  p_drive           text,
  p_body_type       text,
  p_color           text,
  p_vin             text,
  p_city            text,
  p_status          text,
  p_vehicle_category text,
  p_description     text,
  p_is_dealer       boolean,
  p_reserve_online  boolean,
  p_reserve_deposit integer,
  p_credit_available boolean,
  p_leasing_available boolean,
  p_trade_in_accepted boolean,
  p_is_electric     boolean,
  p_range_km        integer,
  p_negotiable      boolean
)
RETURNS crm.auto_vehicles
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = crm, public
AS $$
DECLARE
  v_result crm.auto_vehicles;
BEGIN
  IF p_id IS NULL THEN
    INSERT INTO crm.auto_vehicles (
      user_id, make, model, year, mileage, price, condition,
      engine_volume, engine_type, transmission, drive, body_type, color, vin, city, status,
      vehicle_category, description, is_dealer, reserve_online, reserve_deposit,
      credit_available, leasing_available, trade_in_accepted, is_electric, range_km, negotiable
    ) VALUES (
      auth.uid(), p_make, p_model, p_year, p_mileage, p_price, p_condition,
      p_engine_volume, p_engine_type, p_transmission, p_drive, p_body_type, p_color, p_vin, p_city,
      COALESCE(p_status, 'draft'), COALESCE(p_vehicle_category, 'car'), p_description,
      COALESCE(p_is_dealer, false), COALESCE(p_reserve_online, false), p_reserve_deposit,
      COALESCE(p_credit_available, false), COALESCE(p_leasing_available, false),
      COALESCE(p_trade_in_accepted, true), COALESCE(p_is_electric, false), p_range_km,
      COALESCE(p_negotiable, true)
    ) RETURNING * INTO v_result;
  ELSE
    UPDATE crm.auto_vehicles SET
      make = p_make, model = p_model, year = p_year, mileage = p_mileage,
      price = p_price, condition = p_condition, engine_volume = p_engine_volume,
      engine_type = p_engine_type, transmission = p_transmission, drive = p_drive,
      body_type = p_body_type, color = p_color, vin = p_vin, city = p_city,
      status = COALESCE(p_status, status), vehicle_category = COALESCE(p_vehicle_category, vehicle_category),
      description = p_description, is_dealer = COALESCE(p_is_dealer, is_dealer),
      reserve_online = COALESCE(p_reserve_online, reserve_online),
      reserve_deposit = COALESCE(p_reserve_deposit, reserve_deposit),
      credit_available = COALESCE(p_credit_available, credit_available),
      leasing_available = COALESCE(p_leasing_available, leasing_available),
      trade_in_accepted = COALESCE(p_trade_in_accepted, trade_in_accepted),
      is_electric = COALESCE(p_is_electric, is_electric),
      range_km = COALESCE(p_range_km, range_km),
      negotiable = COALESCE(p_negotiable, negotiable),
      updated_at = now()
    WHERE id = p_id AND user_id = auth.uid()
    RETURNING * INTO v_result;
  END IF;
  RETURN v_result;
END;
$$;

-- ─── RPC: Change vehicle status (with price history) ─────────────────────
CREATE OR REPLACE FUNCTION crm.change_vehicle_status(
  p_vehicle_id uuid,
  p_status     text,
  p_new_price  integer DEFAULT NULL
)
RETURNS crm.auto_vehicles
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = crm, public
AS $$
DECLARE
  v_result crm.auto_vehicles;
  v_old_price integer;
BEGIN
  SELECT price INTO v_old_price FROM crm.auto_vehicles WHERE id = p_vehicle_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Vehicle not found'; END IF;

  UPDATE crm.auto_vehicles SET
    status = p_status,
    price = COALESCE(p_new_price, price),
    -- Append to price history if price changed
    price_history = CASE
      WHEN p_new_price IS NOT NULL AND p_new_price != v_old_price
      THEN price_history || jsonb_build_object('price', v_old_price, 'new_price', p_new_price, 'changed_at', now())
      ELSE price_history
    END,
    updated_at = now()
  WHERE id = p_vehicle_id AND user_id = auth.uid()
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

-- ─── RPC: Get leads ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.get_auto_leads(
  p_stage     text DEFAULT NULL,
  p_priority  text DEFAULT NULL,
  p_vehicle_id uuid DEFAULT NULL
)
RETURNS SETOF crm.auto_leads
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = crm, public
AS $$
  SELECT * FROM crm.auto_leads
  WHERE user_id = auth.uid()
    AND (p_stage IS NULL      OR stage = p_stage)
    AND (p_priority IS NULL   OR priority = p_priority)
    AND (p_vehicle_id IS NULL OR vehicle_id = p_vehicle_id)
  ORDER BY
    CASE priority WHEN 'hot' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
    last_activity_at DESC
$$;

-- ─── RPC: Create/update lead ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.upsert_auto_lead(
  p_id          uuid,
  p_vehicle_id  uuid,
  p_name        text,
  p_phone       text,
  p_email       text,
  p_source      text,
  p_stage       text,
  p_priority    text,
  p_message     text,
  p_budget_min  integer,
  p_budget_max  integer,
  p_notes       text
)
RETURNS crm.auto_leads
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = crm, public
AS $$
DECLARE
  v_result crm.auto_leads;
BEGIN
  IF p_id IS NULL THEN
    INSERT INTO crm.auto_leads (user_id, vehicle_id, name, phone, email, source, stage, priority, message, budget_min, budget_max, notes)
    VALUES (auth.uid(), p_vehicle_id, p_name, p_phone, p_email, COALESCE(p_source,'direct'), COALESCE(p_stage,'new'), COALESCE(p_priority,'normal'), p_message, p_budget_min, p_budget_max, p_notes)
    RETURNING * INTO v_result;
  ELSE
    UPDATE crm.auto_leads SET
      vehicle_id = COALESCE(p_vehicle_id, vehicle_id),
      name = COALESCE(p_name, name), phone = COALESCE(p_phone, phone), email = COALESCE(p_email, email),
      source = COALESCE(p_source, source), stage = COALESCE(p_stage, stage),
      priority = COALESCE(p_priority, priority), message = COALESCE(p_message, message),
      budget_min = COALESCE(p_budget_min, budget_min), budget_max = COALESCE(p_budget_max, budget_max),
      notes = COALESCE(p_notes, notes),
      last_activity_at = now(), updated_at = now()
    WHERE id = p_id AND user_id = auth.uid()
    RETURNING * INTO v_result;
  END IF;
  RETURN v_result;
END;
$$;

-- ─── RPC: Move lead stage ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.move_auto_lead_stage(
  p_lead_id     uuid,
  p_stage       text,
  p_notes       text DEFAULT NULL,
  p_lost_reason text DEFAULT NULL
)
RETURNS crm.auto_leads
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = crm, public
AS $$
DECLARE
  v_result crm.auto_leads;
BEGIN
  UPDATE crm.auto_leads SET
    stage       = p_stage,
    notes       = COALESCE(p_notes, notes),
    lost_reason = COALESCE(p_lost_reason, lost_reason),
    contacted_at = CASE WHEN p_stage = 'contacted' AND contacted_at IS NULL THEN now() ELSE contacted_at END,
    last_activity_at = now(),
    updated_at = now()
  WHERE id = p_lead_id AND user_id = auth.uid()
  RETURNING * INTO v_result;

  -- Log event
  INSERT INTO crm.auto_lead_events (user_id, lead_id, event_type, content)
  VALUES (auth.uid(), p_lead_id, 'stage_change', 'Перемещён на: ' || p_stage);

  RETURN v_result;
END;
$$;

-- ─── RPC: Instant valuation (market comparison) ───────────────────────────
CREATE OR REPLACE FUNCTION crm.compute_auto_valuation(
  p_vehicle_id  uuid DEFAULT NULL,
  p_make        text DEFAULT NULL,
  p_model       text DEFAULT NULL,
  p_year        integer DEFAULT NULL,
  p_mileage     integer DEFAULT NULL,
  p_condition   text DEFAULT 'good',
  p_city        text DEFAULT NULL
)
RETURNS crm.auto_valuations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = crm, public
AS $$
DECLARE
  v_make text := p_make;
  v_model text := p_model;
  v_year integer := p_year;
  v_mileage integer := p_mileage;
  v_comparable_count integer;
  v_avg_price numeric;
  v_mid numeric;
  v_min numeric;
  v_max numeric;
  v_result crm.auto_valuations;
BEGIN
  -- If vehicle_id provided, get params from vehicle
  IF p_vehicle_id IS NOT NULL THEN
    SELECT make, model, year, mileage INTO v_make, v_model, v_year, v_mileage
    FROM crm.auto_vehicles WHERE id = p_vehicle_id AND user_id = auth.uid();
  END IF;

  -- Find comparable active listings from own inventory
  SELECT COUNT(*), AVG(price), MIN(price), MAX(price)
  INTO v_comparable_count, v_avg_price, v_min, v_max
  FROM crm.auto_vehicles
  WHERE user_id = auth.uid()
    AND make ILIKE v_make
    AND model ILIKE v_model
    AND year BETWEEN (v_year - 2) AND (v_year + 2)
    AND status IN ('active', 'sold')
    AND (v_mileage IS NULL OR mileage BETWEEN (v_mileage * 0.7)::int AND (v_mileage * 1.3)::int);

  -- If no comparables, use price from vehicle or estimate
  IF v_comparable_count = 0 OR v_avg_price IS NULL THEN
    SELECT price INTO v_avg_price FROM crm.auto_vehicles WHERE id = p_vehicle_id;
    v_min := COALESCE(v_avg_price * 0.85, 500000);
    v_max := COALESCE(v_avg_price * 1.15, 700000);
    v_avg_price := COALESCE(v_avg_price, 600000);
    v_comparable_count := 0;
  ELSE
    v_min := v_avg_price * 0.90;
    v_max := v_avg_price * 1.10;
  END IF;

  v_mid := v_avg_price;

  -- Apply condition adjustment
  v_mid := v_mid * CASE p_condition
    WHEN 'excellent' THEN 1.08
    WHEN 'good' THEN 1.0
    WHEN 'fair' THEN 0.88
    WHEN 'poor' THEN 0.72
    ELSE 1.0
  END;

  INSERT INTO crm.auto_valuations (
    user_id, vehicle_id, make, model, year, mileage, condition, city,
    value_min, value_mid, value_max, comparable_count, avg_market_price, median_market_price,
    recommended_price, confidence_pct, days_avg_sell,
    price_position
  ) VALUES (
    auth.uid(), p_vehicle_id, v_make, v_model, COALESCE(v_year, 2020),
    COALESCE(v_mileage, 0), p_condition, p_city,
    v_min::int, v_mid::int, v_max::int, v_comparable_count, v_avg_price::int, v_mid::int,
    (v_mid * 0.97)::int,  -- recommended 3% below mid for fast sale
    CASE WHEN v_comparable_count >= 5 THEN 85 WHEN v_comparable_count >= 2 THEN 65 ELSE 40 END,
    CASE p_condition WHEN 'excellent' THEN 14 WHEN 'good' THEN 21 WHEN 'fair' THEN 35 ELSE 60 END,
    CASE
      WHEN p_vehicle_id IS NOT NULL AND
           (SELECT price FROM crm.auto_vehicles WHERE id = p_vehicle_id) < v_min::int THEN 'underpriced'
      WHEN p_vehicle_id IS NOT NULL AND
           (SELECT price FROM crm.auto_vehicles WHERE id = p_vehicle_id) > v_max::int THEN 'overpriced'
      ELSE 'fair'
    END
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- ─── RPC: Create test drive ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.upsert_auto_test_drive(
  p_id          uuid,
  p_vehicle_id  uuid,
  p_lead_id     uuid,
  p_client_name text,
  p_client_phone text,
  p_scheduled_at timestamptz,
  p_duration_min integer,
  p_manager     text,
  p_status      text
)
RETURNS crm.auto_test_drives
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = crm, public
AS $$
DECLARE
  v_result crm.auto_test_drives;
BEGIN
  IF p_id IS NULL THEN
    INSERT INTO crm.auto_test_drives (user_id, vehicle_id, lead_id, client_name, client_phone, scheduled_at, duration_min, manager, status)
    VALUES (auth.uid(), p_vehicle_id, p_lead_id, p_client_name, p_client_phone, p_scheduled_at, COALESCE(p_duration_min,30), p_manager, 'scheduled')
    RETURNING * INTO v_result;
    -- Log in lead events
    IF p_lead_id IS NOT NULL THEN
      INSERT INTO crm.auto_lead_events (user_id, lead_id, event_type, content)
      VALUES (auth.uid(), p_lead_id, 'test_drive', 'Тест-драйв запланирован: ' || to_char(p_scheduled_at, 'DD.MM.YYYY HH24:MI'));
    END IF;
  ELSE
    UPDATE crm.auto_test_drives SET
      status = COALESCE(p_status, status), manager = COALESCE(p_manager, manager),
      scheduled_at = COALESCE(p_scheduled_at, scheduled_at), updated_at = now()
    WHERE id = p_id AND user_id = auth.uid()
    RETURNING * INTO v_result;
  END IF;
  RETURN v_result;
END;
$$;
