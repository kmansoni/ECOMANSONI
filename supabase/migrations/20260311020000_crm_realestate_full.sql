-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- =============================================================================
-- CRM Real Estate Extended Schema
-- Implements: property catalog, showings, documents, client requirements,
--             deal analytics, commission tracking, activity timeline
-- Based on: Bitrix24, TopN Lab, ReBPM, Salesforce Real Estate Cloud analysis
-- =============================================================================

-- ─── PROPERTIES (объекты недвижимости) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.properties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profession      TEXT NOT NULL DEFAULT 'realestate',

  title           TEXT NOT NULL,
  deal_type       TEXT NOT NULL DEFAULT 'sale' CHECK (deal_type IN ('sale','rent','sale_rent')),
  property_type   TEXT NOT NULL DEFAULT 'apartment'
                  CHECK (property_type IN ('apartment','room','house','townhouse','commercial','land','garage','parking')),
  status          TEXT NOT NULL DEFAULT 'available'
                  CHECK (status IN ('available','reserved','sold','rented','off_market')),

  -- Location
  address         TEXT,
  district        TEXT,
  city            TEXT DEFAULT 'Москва',
  geo_lat         NUMERIC(10,7),
  geo_lon         NUMERIC(10,7),
  metro_station   TEXT,
  metro_minutes   INT,

  -- Area
  area_total      NUMERIC(10,2),   -- кв.м.
  area_living     NUMERIC(10,2),
  area_kitchen    NUMERIC(10,2),
  land_area       NUMERIC(10,2),   -- соток

  -- Parameters
  rooms           INT,             -- 0=studio
  floor           INT,
  floors_total    INT,
  building_year   INT,
  building_type   TEXT,            -- панель, кирпич, монолит
  condition       TEXT,            -- новостройка, вторичка, требует ремонта

  -- Pricing
  price           BIGINT,          -- в рублях
  price_per_sqm   BIGINT,
  price_negotiable BOOLEAN DEFAULT false,

  -- Commission
  commission_percent  NUMERIC(5,2),
  commission_fixed    BIGINT,
  commission_shared   BOOLEAN DEFAULT false,

  -- Seller/Owner info
  owner_name      TEXT,
  owner_phone     TEXT,
  exclusive       BOOLEAN DEFAULT false,  -- эксклюзивный договор
  exclusive_until DATE,

  -- Presentation
  description     TEXT,
  photos          TEXT[] DEFAULT '{}',
  floor_plan_url  TEXT,
  video_url       TEXT,
  features        TEXT[] DEFAULT '{}',  -- балкон, паркинг, лифт, кладовая...

  -- Linking
  deal_id         UUID REFERENCES crm.deals(id) ON DELETE SET NULL,

  custom_fields   JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_properties_user_idx ON crm.properties(user_id);
CREATE INDEX IF NOT EXISTS crm_properties_status_idx ON crm.properties(status);
CREATE INDEX IF NOT EXISTS crm_properties_deal_type_idx ON crm.properties(deal_type);
CREATE INDEX IF NOT EXISTS crm_properties_price_idx ON crm.properties(price);

ALTER TABLE crm.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_properties_owner ON crm.properties
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── CLIENT REQUIREMENTS (требования клиентов-покупателей) ──────────────────
CREATE TABLE IF NOT EXISTS crm.client_requirements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id       UUID REFERENCES crm.clients(id) ON DELETE CASCADE,

  deal_type       TEXT CHECK (deal_type IN ('buy','rent')),
  property_types  TEXT[] DEFAULT '{}',
  rooms_min       INT,
  rooms_max       INT,
  area_min        NUMERIC(10,2),
  area_max        NUMERIC(10,2),
  price_min       BIGINT,
  price_max       BIGINT,
  floor_min       INT,
  floor_not_first BOOLEAN DEFAULT false,
  floor_not_last  BOOLEAN DEFAULT false,
  districts       TEXT[] DEFAULT '{}',
  metro_stations  TEXT[] DEFAULT '{}',
  metro_max_min   INT,  -- максимум минут от метро
  features        TEXT[] DEFAULT '{}',
  mortgage        BOOLEAN DEFAULT false,
  mortgage_approved BOOLEAN DEFAULT false,
  budget_comment  TEXT,
  notes           TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE crm.client_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_client_req_owner ON crm.client_requirements
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── SHOWINGS (просмотры объектов) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.showings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id       UUID REFERENCES crm.clients(id) ON DELETE SET NULL,
  property_id     UUID REFERENCES crm.properties(id) ON DELETE SET NULL,
  deal_id         UUID REFERENCES crm.deals(id) ON DELETE SET NULL,

  scheduled_at    TIMESTAMPTZ NOT NULL,
  duration_min    INT DEFAULT 60,
  status          TEXT NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled','completed','cancelled','no_show')),
  outcome         TEXT,    -- interested / not_interested / thinking / offer_made
  notes           TEXT,
  feedback        TEXT,
  next_step       TEXT,
  reminder_sent   BOOLEAN DEFAULT false,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_showings_user_idx ON crm.showings(user_id);
CREATE INDEX IF NOT EXISTS crm_showings_scheduled_idx ON crm.showings(scheduled_at);
CREATE INDEX IF NOT EXISTS crm_showings_client_idx ON crm.showings(client_id);

ALTER TABLE crm.showings ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_showings_owner ON crm.showings
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── DOCUMENTS (документы по сделке) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.deal_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id         UUID REFERENCES crm.deals(id) ON DELETE CASCADE,
  client_id       UUID REFERENCES crm.clients(id) ON DELETE SET NULL,
  property_id     UUID REFERENCES crm.properties(id) ON DELETE SET NULL,

  doc_type        TEXT NOT NULL,
  -- sale: preliminary_contract, main_contract, title_deed, registration_cert, etc.
  -- rent: lease_agreement, inventory_act, receipt, etc.
  title           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','received','signed','submitted','registered','rejected')),
  file_url        TEXT,
  notes           TEXT,
  due_date        DATE,
  signed_at       DATE,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_docs_deal_idx ON crm.deal_documents(deal_id);
ALTER TABLE crm.deal_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_docs_owner ON crm.deal_documents
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── DEAL SOURCE TRACKING ────────────────────────────────────────────────────
-- Добавляем source поле к сделкам если ещё нет
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='crm' AND table_name='deals' AND column_name='source'
  ) THEN
    ALTER TABLE crm.deals ADD COLUMN source TEXT DEFAULT 'direct';
    -- Источники: direct, avito, cian, domclick, yandex_realty, referral, social, website, cold_call, other
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='crm' AND table_name='deals' AND column_name='property_id'
  ) THEN
    ALTER TABLE crm.deals ADD COLUMN property_id UUID REFERENCES crm.properties(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='crm' AND table_name='deals' AND column_name='commission_amount'
  ) THEN
    ALTER TABLE crm.deals ADD COLUMN commission_amount BIGINT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='crm' AND table_name='deals' AND column_name='mortgage'
  ) THEN
    ALTER TABLE crm.deals ADD COLUMN mortgage BOOLEAN DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='crm' AND table_name='deals' AND column_name='mortgage_bank'
  ) THEN
    ALTER TABLE crm.deals ADD COLUMN mortgage_bank TEXT;
  END IF;
END $$;

-- ─── RPC: PROPERTIES ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.get_properties(
  p_status TEXT DEFAULT NULL,
  p_deal_type TEXT DEFAULT NULL,
  p_price_min BIGINT DEFAULT NULL,
  p_price_max BIGINT DEFAULT NULL,
  p_rooms INT DEFAULT NULL
)
RETURNS SETOF crm.properties
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  SELECT * FROM crm.properties
  WHERE user_id = auth.uid()
    AND (p_status IS NULL OR status = p_status)
    AND (p_deal_type IS NULL OR deal_type = p_deal_type)
    AND (p_price_min IS NULL OR price >= p_price_min)
    AND (p_price_max IS NULL OR price <= p_price_max)
    AND (p_rooms IS NULL OR rooms = p_rooms)
  ORDER BY created_at DESC;
$$;

CREATE OR REPLACE FUNCTION crm.create_property(
  p_title TEXT,
  p_deal_type TEXT DEFAULT 'sale',
  p_property_type TEXT DEFAULT 'apartment',
  p_address TEXT DEFAULT NULL,
  p_district TEXT DEFAULT NULL,
  p_city TEXT DEFAULT 'Москва',
  p_area_total NUMERIC DEFAULT NULL,
  p_rooms INT DEFAULT NULL,
  p_floor INT DEFAULT NULL,
  p_floors_total INT DEFAULT NULL,
  p_price BIGINT DEFAULT NULL,
  p_commission_percent NUMERIC DEFAULT NULL,
  p_owner_name TEXT DEFAULT NULL,
  p_owner_phone TEXT DEFAULT NULL,
  p_exclusive BOOLEAN DEFAULT false,
  p_features TEXT[] DEFAULT '{}',
  p_description TEXT DEFAULT NULL,
  p_condition TEXT DEFAULT NULL,
  p_building_type TEXT DEFAULT NULL,
  p_custom_fields JSONB DEFAULT '{}'
)
RETURNS crm.properties
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  INSERT INTO crm.properties(
    user_id, title, deal_type, property_type, address, district, city,
    area_total, rooms, floor, floors_total, price,
    commission_percent, owner_name, owner_phone, exclusive,
    features, description, condition, building_type, custom_fields
  ) VALUES (
    auth.uid(), p_title, p_deal_type, p_property_type, p_address, p_district, p_city,
    p_area_total, p_rooms, p_floor, p_floors_total, p_price,
    p_commission_percent, p_owner_name, p_owner_phone, p_exclusive,
    p_features, p_description, p_condition, p_building_type, p_custom_fields
  )
  RETURNING *;
$$;

CREATE OR REPLACE FUNCTION crm.update_property(
  p_id UUID,
  p_title TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_deal_type TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_district TEXT DEFAULT NULL,
  p_area_total NUMERIC DEFAULT NULL,
  p_rooms INT DEFAULT NULL,
  p_floor INT DEFAULT NULL,
  p_price BIGINT DEFAULT NULL,
  p_commission_percent NUMERIC DEFAULT NULL,
  p_owner_name TEXT DEFAULT NULL,
  p_owner_phone TEXT DEFAULT NULL,
  p_exclusive BOOLEAN DEFAULT NULL,
  p_features TEXT[] DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_deal_id UUID DEFAULT NULL
)
RETURNS crm.properties
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  UPDATE crm.properties SET
    title              = COALESCE(p_title, title),
    status             = COALESCE(p_status, status),
    deal_type          = COALESCE(p_deal_type, deal_type),
    address            = COALESCE(p_address, address),
    district           = COALESCE(p_district, district),
    area_total         = COALESCE(p_area_total, area_total),
    rooms              = COALESCE(p_rooms, rooms),
    floor              = COALESCE(p_floor, floor),
    price              = COALESCE(p_price, price),
    commission_percent = COALESCE(p_commission_percent, commission_percent),
    owner_name         = COALESCE(p_owner_name, owner_name),
    owner_phone        = COALESCE(p_owner_phone, owner_phone),
    exclusive          = COALESCE(p_exclusive, exclusive),
    features           = COALESCE(p_features, features),
    description        = COALESCE(p_description, description),
    deal_id            = COALESCE(p_deal_id, deal_id),
    updated_at         = NOW()
  WHERE id = p_id AND user_id = auth.uid()
  RETURNING *;
$$;

CREATE OR REPLACE FUNCTION crm.delete_property(p_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  DELETE FROM crm.properties WHERE id = p_id AND user_id = auth.uid()
  RETURNING TRUE;
$$;

-- ─── RPC: SHOWINGS ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.get_showings(
  p_client_id UUID DEFAULT NULL,
  p_property_id UUID DEFAULT NULL,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF crm.showings
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  SELECT * FROM crm.showings
  WHERE user_id = auth.uid()
    AND (p_client_id IS NULL OR client_id = p_client_id)
    AND (p_property_id IS NULL OR property_id = p_property_id)
    AND (p_date_from IS NULL OR scheduled_at >= p_date_from)
    AND (p_date_to IS NULL OR scheduled_at <= p_date_to)
  ORDER BY scheduled_at DESC;
$$;

CREATE OR REPLACE FUNCTION crm.create_showing(
  p_client_id UUID,
  p_property_id UUID,
  p_scheduled_at TIMESTAMPTZ,
  p_duration_min INT DEFAULT 60,
  p_deal_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS crm.showings
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  INSERT INTO crm.showings(user_id, client_id, property_id, deal_id, scheduled_at, duration_min, notes)
  VALUES (auth.uid(), p_client_id, p_property_id, p_deal_id, p_scheduled_at, p_duration_min, p_notes)
  RETURNING *;
$$;

CREATE OR REPLACE FUNCTION crm.update_showing(
  p_id UUID,
  p_status TEXT DEFAULT NULL,
  p_outcome TEXT DEFAULT NULL,
  p_feedback TEXT DEFAULT NULL,
  p_next_step TEXT DEFAULT NULL,
  p_scheduled_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS crm.showings
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  UPDATE crm.showings SET
    status       = COALESCE(p_status, status),
    outcome      = COALESCE(p_outcome, outcome),
    feedback     = COALESCE(p_feedback, feedback),
    next_step    = COALESCE(p_next_step, next_step),
    scheduled_at = COALESCE(p_scheduled_at, scheduled_at),
    updated_at   = NOW()
  WHERE id = p_id AND user_id = auth.uid()
  RETURNING *;
$$;

-- ─── RPC: DOCUMENTS ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.get_deal_documents(p_deal_id UUID)
RETURNS SETOF crm.deal_documents
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  SELECT * FROM crm.deal_documents
  WHERE user_id = auth.uid() AND deal_id = p_deal_id
  ORDER BY created_at;
$$;

CREATE OR REPLACE FUNCTION crm.upsert_deal_document(
  p_deal_id UUID,
  p_doc_type TEXT,
  p_title TEXT,
  p_status TEXT DEFAULT 'pending',
  p_notes TEXT DEFAULT NULL,
  p_due_date DATE DEFAULT NULL,
  p_id UUID DEFAULT NULL
)
RETURNS crm.deal_documents
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  INSERT INTO crm.deal_documents(id, user_id, deal_id, doc_type, title, status, notes, due_date)
  VALUES (
    COALESCE(p_id, gen_random_uuid()),
    auth.uid(), p_deal_id, p_doc_type, p_title, p_status, p_notes, p_due_date
  )
  ON CONFLICT (id) DO UPDATE SET
    status     = EXCLUDED.status,
    notes      = EXCLUDED.notes,
    due_date   = EXCLUDED.due_date,
    updated_at = NOW()
  RETURNING *;
$$;

-- ─── RPC: CLIENT REQUIREMENTS ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.upsert_client_requirements(
  p_client_id UUID,
  p_deal_type TEXT DEFAULT 'buy',
  p_property_types TEXT[] DEFAULT '{}',
  p_rooms_min INT DEFAULT NULL,
  p_rooms_max INT DEFAULT NULL,
  p_price_min BIGINT DEFAULT NULL,
  p_price_max BIGINT DEFAULT NULL,
  p_districts TEXT[] DEFAULT '{}',
  p_mortgage BOOLEAN DEFAULT false,
  p_notes TEXT DEFAULT NULL
)
RETURNS crm.client_requirements
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  INSERT INTO crm.client_requirements(
    user_id, client_id, deal_type, property_types,
    rooms_min, rooms_max, price_min, price_max,
    districts, mortgage, notes
  ) VALUES (
    auth.uid(), p_client_id, p_deal_type, p_property_types,
    p_rooms_min, p_rooms_max, p_price_min, p_price_max,
    p_districts, p_mortgage, p_notes
  )
  ON CONFLICT (client_id) DO UPDATE SET
    deal_type      = EXCLUDED.deal_type,
    property_types = EXCLUDED.property_types,
    rooms_min      = EXCLUDED.rooms_min,
    rooms_max      = EXCLUDED.rooms_max,
    price_min      = EXCLUDED.price_min,
    price_max      = EXCLUDED.price_max,
    districts      = EXCLUDED.districts,
    mortgage       = EXCLUDED.mortgage,
    notes          = EXCLUDED.notes,
    updated_at     = NOW()
  RETURNING *;
$$;

-- Add unique constraint for client requirements
ALTER TABLE crm.client_requirements
  DROP CONSTRAINT IF EXISTS crm_client_req_unique_client;
ALTER TABLE crm.client_requirements
  ADD CONSTRAINT crm_client_req_unique_client UNIQUE (client_id);

-- ─── RPC: IMPROVED DASHBOARD STATS (with sources) ────────────────────────────
CREATE OR REPLACE FUNCTION crm.get_dashboard_stats_v2(p_profession TEXT DEFAULT 'default')
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_clients',           (SELECT COUNT(*) FROM crm.clients WHERE user_id=auth.uid() AND profession=p_profession),
    'active_deals',            (SELECT COUNT(*) FROM crm.deals WHERE user_id=auth.uid() AND profession=p_profession AND NOT won AND NOT lost),
    'won_deals',               (SELECT COUNT(*) FROM crm.deals WHERE user_id=auth.uid() AND profession=p_profession AND won),
    'lost_deals',              (SELECT COUNT(*) FROM crm.deals WHERE user_id=auth.uid() AND profession=p_profession AND lost),
    'total_deals_value',       (SELECT COALESCE(SUM(value),0) FROM crm.deals WHERE user_id=auth.uid() AND profession=p_profession AND won),
    'active_deals_value',      (SELECT COALESCE(SUM(value),0) FROM crm.deals WHERE user_id=auth.uid() AND profession=p_profession AND NOT won AND NOT lost),
    'pipeline_value',          (SELECT COALESCE(SUM(value),0) FROM crm.deals WHERE user_id=auth.uid() AND profession=p_profession AND NOT lost),
    'commission_earned',       (SELECT COALESCE(SUM(commission_amount),0) FROM crm.deals WHERE user_id=auth.uid() AND profession=p_profession AND won),
    'pending_tasks',           (SELECT COUNT(*) FROM crm.tasks WHERE user_id=auth.uid() AND profession=p_profession AND status IN ('pending','in_progress')),
    'overdue_tasks',           (SELECT COUNT(*) FROM crm.tasks WHERE user_id=auth.uid() AND profession=p_profession AND status NOT IN ('completed','cancelled') AND due_date < NOW()),
    'completed_tasks_week',    (SELECT COUNT(*) FROM crm.tasks WHERE user_id=auth.uid() AND profession=p_profession AND status='completed' AND completed_at >= NOW()-INTERVAL '7 days'),
    'available_properties',    (SELECT COUNT(*) FROM crm.properties WHERE user_id=auth.uid() AND status='available'),
    'showings_today',          (SELECT COUNT(*) FROM crm.showings WHERE user_id=auth.uid() AND scheduled_at::date = NOW()::date AND status='scheduled'),
    'showings_this_week',      (SELECT COUNT(*) FROM crm.showings WHERE user_id=auth.uid() AND scheduled_at >= date_trunc('week',NOW()) AND scheduled_at < date_trunc('week',NOW())+INTERVAL '7 days'),
    'conversion_rate',         (
      SELECT CASE WHEN total_d = 0 THEN 0
             ELSE ROUND(won_d::NUMERIC / total_d * 100, 1)
             END
      FROM (
        SELECT COUNT(*) FILTER (WHERE won) as won_d,
               COUNT(*) as total_d
        FROM crm.deals
        WHERE user_id=auth.uid() AND profession=p_profession
          AND created_at >= NOW()-INTERVAL '90 days'
      ) x
    ),
    'sources',                 (
      SELECT jsonb_agg(jsonb_build_object('source', source, 'count', cnt, 'value', val))
      FROM (
        SELECT source, COUNT(*) cnt, COALESCE(SUM(value),0) val
        FROM crm.deals
        WHERE user_id=auth.uid() AND profession=p_profession AND NOT lost
        GROUP BY source
        ORDER BY cnt DESC
      ) s
    ),
    'new_clients_this_month',  (SELECT COUNT(*) FROM crm.clients WHERE user_id=auth.uid() AND profession=p_profession AND created_at >= date_trunc('month',NOW()))
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ─── RPC: PROPERTY MATCHING ───────────────────────────────────────────────────
-- Finds properties matching client requirements
CREATE OR REPLACE FUNCTION crm.match_properties_for_client(p_client_id UUID)
RETURNS SETOF crm.properties
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE
  req crm.client_requirements;
BEGIN
  SELECT * INTO req FROM crm.client_requirements
  WHERE client_id = p_client_id AND user_id = auth.uid();

  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
    SELECT p.* FROM crm.properties p
    WHERE p.user_id = auth.uid()
      AND p.status = 'available'
      AND (req.deal_type IS NULL
           OR (req.deal_type = 'buy' AND p.deal_type IN ('sale','sale_rent'))
           OR (req.deal_type = 'rent' AND p.deal_type IN ('rent','sale_rent')))
      AND (req.property_types = '{}' OR p.property_type = ANY(req.property_types))
      AND (req.rooms_min IS NULL OR p.rooms >= req.rooms_min)
      AND (req.rooms_max IS NULL OR p.rooms <= req.rooms_max)
      AND (req.price_min IS NULL OR p.price >= req.price_min)
      AND (req.price_max IS NULL OR p.price <= req.price_max)
      AND (req.districts = '{}' OR p.district = ANY(req.districts))
    ORDER BY p.price;
END;
$$;

-- ─── UPDATED_AT TRIGGERS ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_properties_updated_at') THEN
    CREATE TRIGGER trg_properties_updated_at BEFORE UPDATE ON crm.properties
      FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_showings_updated_at') THEN
    CREATE TRIGGER trg_showings_updated_at BEFORE UPDATE ON crm.showings
      FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_docs_updated_at') THEN
    CREATE TRIGGER trg_docs_updated_at BEFORE UPDATE ON crm.deal_documents
      FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();
  END IF;
END $$;
