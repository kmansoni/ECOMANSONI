-- ============================================================
-- CRM Real Estate — полная схема
-- Уровень: Bitrix24 RE + TopN Lab + ReBPM + Follow Up Boss
-- ============================================================

-- Схема
CREATE SCHEMA IF NOT EXISTS crm_re;

-- ─── 1. Клиенты (покупатели / арендаторы / продавцы) ────────────────────────
CREATE TABLE IF NOT EXISTS crm_re.clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  phone           TEXT,
  email           TEXT,
  telegram        TEXT,
  whatsapp        TEXT,
  client_type     TEXT NOT NULL DEFAULT 'buyer'
                    CHECK (client_type IN ('buyer','seller','tenant','landlord','investor')),
  budget_min      BIGINT,
  budget_max      BIGINT,
  deal_type       TEXT DEFAULT 'sale' CHECK (deal_type IN ('sale','rent','mortgage')),
  property_types  TEXT[] DEFAULT '{}',   -- apartment, house, commercial, land
  rooms_min       INT,
  rooms_max       INT,
  area_min        NUMERIC(8,2),
  area_max        NUMERIC(8,2),
  districts       TEXT[] DEFAULT '{}',
  metro_stations  TEXT[] DEFAULT '{}',
  mortgage_ready  BOOLEAN DEFAULT FALSE,
  mortgage_bank   TEXT,
  mortgage_amount BIGINT,
  source          TEXT DEFAULT 'manual'
                    CHECK (source IN ('manual','cian','avito','yandex','domclick','instagram','vk','referral','call','website','other')),
  source_detail   TEXT,
  lead_score      INT DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
  stage           TEXT NOT NULL DEFAULT 'new'
                    CHECK (stage IN ('new','contacted','qualified','viewing','negotiation','contract','won','lost','cold')),
  tags            TEXT[] DEFAULT '{}',
  notes           TEXT,
  assigned_to     UUID REFERENCES auth.users(id),
  last_contact_at TIMESTAMPTZ,
  next_contact_at TIMESTAMPTZ,
  drip_campaign   TEXT,   -- active drip campaign id
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 2. Объекты недвижимости ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_re.properties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  property_type   TEXT NOT NULL DEFAULT 'apartment'
                    CHECK (property_type IN ('apartment','room','house','townhouse','commercial','land','garage','parking','new_building')),
  deal_type       TEXT NOT NULL DEFAULT 'sale' CHECK (deal_type IN ('sale','rent')),
  status          TEXT NOT NULL DEFAULT 'available'
                    CHECK (status IN ('available','reserved','sold','rented','off_market','draft')),
  -- Адрес
  address         TEXT,
  city            TEXT DEFAULT 'Москва',
  district        TEXT,
  metro_station   TEXT,
  metro_distance  INT,   -- минут пешком
  lat             NUMERIC(10,7),
  lng             NUMERIC(10,7),
  -- Характеристики
  rooms           INT,
  floor           INT,
  floors_total    INT,
  area_total      NUMERIC(8,2),
  area_living     NUMERIC(8,2),
  area_kitchen    NUMERIC(8,2),
  ceiling_height  NUMERIC(4,2),
  year_built      INT,
  renovation       TEXT CHECK (renovation IN ('cosmetic','euro','designer','no_renovation','pre_sale')),
  balcony         BOOLEAN DEFAULT FALSE,
  parking         TEXT CHECK (parking IN ('none','street','underground','multi_level')),
  -- Цена
  price           BIGINT NOT NULL DEFAULT 0,
  price_per_sqm   BIGINT GENERATED ALWAYS AS (
                    CASE WHEN area_total > 0 THEN (price / area_total)::BIGINT ELSE 0 END
                  ) STORED,
  price_negotiable BOOLEAN DEFAULT TRUE,
  -- Ипотека
  mortgage_possible BOOLEAN DEFAULT TRUE,
  mortgage_rate   NUMERIC(5,2),
  -- Комиссия
  commission_pct  NUMERIC(5,2) DEFAULT 2.0,
  commission_fixed BIGINT,
  commission_who  TEXT DEFAULT 'buyer' CHECK (commission_who IN ('buyer','seller','split')),
  -- Медиа
  photos          TEXT[] DEFAULT '{}',
  video_url       TEXT,
  virtual_tour_url TEXT,
  floor_plan_url  TEXT,
  -- Публикация
  published_cian  BOOLEAN DEFAULT FALSE,
  published_avito BOOLEAN DEFAULT FALSE,
  published_yandex BOOLEAN DEFAULT FALSE,
  published_domclick BOOLEAN DEFAULT FALSE,
  cian_id         TEXT,
  avito_id        TEXT,
  -- Продавец
  seller_client_id UUID REFERENCES crm_re.clients(id),
  seller_name     TEXT,
  seller_phone    TEXT,
  -- Оценка
  avm_price       BIGINT,   -- автоматическая оценка рыночной стоимости
  avm_updated_at  TIMESTAMPTZ,
  -- Описание
  description     TEXT,
  features        TEXT[] DEFAULT '{}',
  notes           TEXT,
  -- Метаданные
  views_count     INT DEFAULT 0,
  favorites_count INT DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 3. Сделки ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_re.deals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  deal_type       TEXT NOT NULL DEFAULT 'sale' CHECK (deal_type IN ('sale','rent','mortgage','exchange')),
  stage           TEXT NOT NULL DEFAULT 'new'
                    CHECK (stage IN ('new','contacted','qualified','viewing','negotiation','contract','registration','won','lost')),
  client_id       UUID REFERENCES crm_re.clients(id),
  property_id     UUID REFERENCES crm_re.properties(id),
  -- Финансы
  deal_price      BIGINT,
  commission_pct  NUMERIC(5,2),
  commission_amount BIGINT,
  deposit_amount  BIGINT,
  deposit_paid_at TIMESTAMPTZ,
  -- Ипотека
  mortgage_bank   TEXT,
  mortgage_amount BIGINT,
  mortgage_rate   NUMERIC(5,2),
  mortgage_term   INT,   -- лет
  mortgage_approved BOOLEAN,
  mortgage_approved_at TIMESTAMPTZ,
  -- Документы
  contract_signed_at TIMESTAMPTZ,
  registration_date  DATE,
  keys_handover_date DATE,
  -- Статус
  won             BOOLEAN DEFAULT FALSE,
  lost            BOOLEAN DEFAULT FALSE,
  lost_reason     TEXT,
  -- Метаданные
  source          TEXT,
  notes           TEXT,
  assigned_to     UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 4. Показы ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_re.showings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id       UUID REFERENCES crm_re.clients(id),
  property_id     UUID REFERENCES crm_re.properties(id),
  deal_id         UUID REFERENCES crm_re.deals(id),
  scheduled_at    TIMESTAMPTZ NOT NULL,
  duration_min    INT DEFAULT 30,
  status          TEXT NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled','completed','cancelled','no_show','rescheduled')),
  -- Результат
  client_feedback TEXT CHECK (client_feedback IN ('very_interested','interested','neutral','not_interested','rejected')),
  client_notes    TEXT,
  agent_notes     TEXT,
  -- Фото-отчёт
  report_photos   TEXT[] DEFAULT '{}',
  -- Маршрут (несколько объектов за один выезд)
  route_order     INT DEFAULT 1,
  route_group_id  UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 5. Задачи ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_re.tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  task_type       TEXT DEFAULT 'call'
                    CHECK (task_type IN ('call','email','whatsapp','meeting','showing','document','other')),
  priority        TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled')),
  due_date        TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  client_id       UUID REFERENCES crm_re.clients(id),
  property_id     UUID REFERENCES crm_re.properties(id),
  deal_id         UUID REFERENCES crm_re.deals(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 6. Документы ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_re.documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id         UUID REFERENCES crm_re.deals(id),
  client_id       UUID REFERENCES crm_re.clients(id),
  property_id     UUID REFERENCES crm_re.properties(id),
  doc_type        TEXT NOT NULL
                    CHECK (doc_type IN ('contract_sale','contract_rent','act_acceptance','power_of_attorney',
                                        'mortgage_agreement','deposit_agreement','preliminary_contract',
                                        'title_deed','passport_copy','other')),
  title           TEXT NOT NULL,
  file_url        TEXT,
  signed          BOOLEAN DEFAULT FALSE,
  signed_at       TIMESTAMPTZ,
  expires_at      DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 7. Drip-кампании (автоматические касания) ───────────────────────────────
CREATE TABLE IF NOT EXISTS crm_re.drip_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  trigger_stage   TEXT,   -- запускается при переходе в стадию
  steps           JSONB NOT NULL DEFAULT '[]',
  -- step: { day: int, type: 'sms'|'email'|'whatsapp'|'task', template: string }
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 8. Аналитика района ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_re.district_analytics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city            TEXT NOT NULL,
  district        TEXT NOT NULL,
  avg_price_sqm   BIGINT,
  avg_price_sqm_1r BIGINT,
  avg_price_sqm_2r BIGINT,
  avg_price_sqm_3r BIGINT,
  listings_count  INT,
  days_on_market  INT,   -- среднее время продажи
  price_trend_pct NUMERIC(5,2),   -- % изменение за месяц
  infrastructure  JSONB DEFAULT '{}',
  -- { schools: int, kindergartens: int, hospitals: int, malls: int, parks: int }
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(city, district)
);

-- ─── 9. Сравнение объектов ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_re.property_comparisons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id       UUID REFERENCES crm_re.clients(id),
  property_ids    UUID[] NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Индексы ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_re_clients_user    ON crm_re.clients(user_id);
CREATE INDEX IF NOT EXISTS idx_re_clients_stage   ON crm_re.clients(stage);
CREATE INDEX IF NOT EXISTS idx_re_clients_source  ON crm_re.clients(source);
CREATE INDEX IF NOT EXISTS idx_re_properties_user ON crm_re.properties(user_id);
CREATE INDEX IF NOT EXISTS idx_re_properties_type ON crm_re.properties(property_type, deal_type);
CREATE INDEX IF NOT EXISTS idx_re_properties_status ON crm_re.properties(status);
CREATE INDEX IF NOT EXISTS idx_re_properties_price ON crm_re.properties(price);
CREATE INDEX IF NOT EXISTS idx_re_deals_user      ON crm_re.deals(user_id);
CREATE INDEX IF NOT EXISTS idx_re_deals_stage     ON crm_re.deals(stage);
CREATE INDEX IF NOT EXISTS idx_re_showings_user   ON crm_re.showings(user_id);
CREATE INDEX IF NOT EXISTS idx_re_showings_date   ON crm_re.showings(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_re_tasks_user      ON crm_re.tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_re_tasks_due       ON crm_re.tasks(due_date) WHERE status != 'completed';

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE crm_re.clients              ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_re.properties           ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_re.deals                ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_re.showings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_re.tasks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_re.documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_re.drip_campaigns       ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_re.district_analytics   ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_re.property_comparisons ENABLE ROW LEVEL SECURITY;

-- Политики: владелец видит только свои данные
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'crm_re.clients','crm_re.properties','crm_re.deals',
    'crm_re.showings','crm_re.tasks','crm_re.documents',
    'crm_re.drip_campaigns','crm_re.property_comparisons'
  ]) LOOP
    EXECUTE format('CREATE POLICY re_owner_all ON %s FOR ALL USING (user_id = auth.uid())', tbl);
  END LOOP;
END $$;

-- district_analytics — публичное чтение
CREATE POLICY re_district_read ON crm_re.district_analytics FOR SELECT USING (TRUE);

-- ─── Триггеры updated_at ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_re.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'clients','properties','deals','showings','tasks'
  ]) LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_re_%s_updated BEFORE UPDATE ON crm_re.%s FOR EACH ROW EXECUTE FUNCTION crm_re.set_updated_at()',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ─── RPC: Дашборд статистика ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_re.get_dashboard_stats(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = crm_re, public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_clients',        (SELECT COUNT(*) FROM crm_re.clients WHERE user_id = p_user_id),
    'new_clients_month',    (SELECT COUNT(*) FROM crm_re.clients WHERE user_id = p_user_id AND created_at > NOW() - INTERVAL '30 days'),
    'active_deals',         (SELECT COUNT(*) FROM crm_re.deals WHERE user_id = p_user_id AND NOT won AND NOT lost),
    'pipeline_value',       (SELECT COALESCE(SUM(deal_price),0) FROM crm_re.deals WHERE user_id = p_user_id AND NOT won AND NOT lost),
    'won_deals_month',      (SELECT COUNT(*) FROM crm_re.deals WHERE user_id = p_user_id AND won AND updated_at > NOW() - INTERVAL '30 days'),
    'commission_month',     (SELECT COALESCE(SUM(commission_amount),0) FROM crm_re.deals WHERE user_id = p_user_id AND won AND updated_at > NOW() - INTERVAL '30 days'),
    'total_properties',     (SELECT COUNT(*) FROM crm_re.properties WHERE user_id = p_user_id),
    'available_properties', (SELECT COUNT(*) FROM crm_re.properties WHERE user_id = p_user_id AND status = 'available'),
    'showings_today',       (SELECT COUNT(*) FROM crm_re.showings WHERE user_id = p_user_id AND scheduled_at::DATE = CURRENT_DATE AND status = 'scheduled'),
    'showings_week',        (SELECT COUNT(*) FROM crm_re.showings WHERE user_id = p_user_id AND scheduled_at > NOW() AND scheduled_at < NOW() + INTERVAL '7 days'),
    'overdue_tasks',        (SELECT COUNT(*) FROM crm_re.tasks WHERE user_id = p_user_id AND status != 'completed' AND due_date < NOW()),
    'conversion_rate',      (
      SELECT CASE WHEN (won_c + lost_c) > 0 THEN ROUND(won_c * 100.0 / (won_c + lost_c), 1) ELSE 0 END
      FROM (
        SELECT
          COUNT(*) FILTER (WHERE won) AS won_c,
          COUNT(*) FILTER (WHERE lost) AS lost_c
        FROM crm_re.deals WHERE user_id = p_user_id
      ) sub
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- ─── RPC: Подбор объектов под требования клиента ─────────────────────────────
CREATE OR REPLACE FUNCTION crm_re.match_properties_for_client(p_client_id UUID)
RETURNS TABLE(
  property_id UUID,
  title TEXT,
  price BIGINT,
  area_total NUMERIC,
  rooms INT,
  district TEXT,
  match_score INT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = crm_re, public
AS $$
DECLARE
  v_client crm_re.clients%ROWTYPE;
BEGIN
  SELECT * INTO v_client FROM crm_re.clients WHERE id = p_client_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.title,
    p.price,
    p.area_total,
    p.rooms,
    p.district,
    (
      -- Ценовой диапазон: 40 баллов
      CASE WHEN (v_client.budget_min IS NULL OR p.price >= v_client.budget_min)
                AND (v_client.budget_max IS NULL OR p.price <= v_client.budget_max)
           THEN 40 ELSE 0 END
      -- Тип объекта: 20 баллов
      + CASE WHEN v_client.property_types = '{}' OR p.property_type = ANY(v_client.property_types)
             THEN 20 ELSE 0 END
      -- Комнаты: 20 баллов
      + CASE WHEN (v_client.rooms_min IS NULL OR p.rooms >= v_client.rooms_min)
                  AND (v_client.rooms_max IS NULL OR p.rooms <= v_client.rooms_max)
             THEN 20 ELSE 0 END
      -- Район: 20 баллов
      + CASE WHEN v_client.districts = '{}' OR p.district = ANY(v_client.districts)
             THEN 20 ELSE 0 END
    )::INT AS match_score
  FROM crm_re.properties p
  WHERE p.user_id = auth.uid()
    AND p.status = 'available'
    AND p.deal_type = v_client.deal_type
  ORDER BY match_score DESC, p.created_at DESC
  LIMIT 20;
END;
$$;

-- ─── RPC: Ипотечный калькулятор ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_re.calc_mortgage(
  p_price BIGINT,
  p_down_payment_pct NUMERIC,  -- % первоначального взноса
  p_rate NUMERIC,              -- % годовых
  p_term_years INT             -- срок в годах
)
RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_loan BIGINT;
  v_monthly_rate NUMERIC;
  v_n INT;
  v_payment NUMERIC;
  v_total NUMERIC;
  v_overpayment NUMERIC;
BEGIN
  v_loan := p_price * (1 - p_down_payment_pct / 100);
  v_monthly_rate := p_rate / 100 / 12;
  v_n := p_term_years * 12;

  IF v_monthly_rate = 0 THEN
    v_payment := v_loan / v_n;
  ELSE
    v_payment := v_loan * v_monthly_rate * POWER(1 + v_monthly_rate, v_n)
                 / (POWER(1 + v_monthly_rate, v_n) - 1);
  END IF;

  v_total := v_payment * v_n;
  v_overpayment := v_total - v_loan;

  RETURN jsonb_build_object(
    'loan_amount',      v_loan,
    'monthly_payment',  ROUND(v_payment),
    'total_payment',    ROUND(v_total),
    'overpayment',      ROUND(v_overpayment),
    'down_payment',     p_price - v_loan,
    'effective_rate',   p_rate
  );
END;
$$;

-- ─── Seed: Аналитика районов Москвы ──────────────────────────────────────────
INSERT INTO crm_re.district_analytics (city, district, avg_price_sqm, avg_price_sqm_1r, avg_price_sqm_2r, avg_price_sqm_3r, listings_count, days_on_market, price_trend_pct, infrastructure)
VALUES
  ('Москва', 'Центральный', 450000, 520000, 430000, 410000, 1240, 45, 1.2, '{"schools":12,"kindergartens":8,"hospitals":5,"malls":15,"parks":6}'),
  ('Москва', 'Пресненский', 420000, 490000, 400000, 380000, 890, 38, 0.8, '{"schools":9,"kindergartens":6,"hospitals":3,"malls":12,"parks":4}'),
  ('Москва', 'Хамовники', 480000, 550000, 460000, 440000, 650, 52, 1.5, '{"schools":8,"kindergartens":5,"hospitals":4,"malls":8,"parks":10}'),
  ('Москва', 'Арбат', 510000, 580000, 490000, 470000, 420, 60, 0.5, '{"schools":6,"kindergartens":4,"hospitals":3,"malls":10,"parks":5}'),
  ('Москва', 'Замоскворечье', 390000, 450000, 370000, 350000, 780, 42, 1.1, '{"schools":10,"kindergartens":7,"hospitals":4,"malls":9,"parks":7}'),
  ('Москва', 'Тверской', 430000, 500000, 410000, 390000, 560, 48, 0.9, '{"schools":7,"kindergartens":5,"hospitals":4,"malls":11,"parks":5}'),
  ('Москва', 'Митино', 195000, 220000, 185000, 175000, 2100, 28, 2.1, '{"schools":18,"kindergartens":14,"hospitals":3,"malls":4,"parks":8}'),
  ('Москва', 'Строгино', 210000, 235000, 200000, 190000, 1800, 25, 1.8, '{"schools":15,"kindergartens":12,"hospitals":2,"malls":3,"parks":12}'),
  ('Москва', 'Крылатское', 230000, 260000, 220000, 210000, 1200, 30, 1.5, '{"schools":12,"kindergartens":10,"hospitals":2,"malls":3,"parks":15}'),
  ('Москва', 'Хорошёво-Мнёвники', 220000, 245000, 210000, 200000, 1500, 27, 1.9, '{"schools":14,"kindergartens":11,"hospitals":2,"malls":4,"parks":10}')
ON CONFLICT (city, district) DO UPDATE SET
  avg_price_sqm = EXCLUDED.avg_price_sqm,
  updated_at = NOW();

-- ─── RPC: CRUD helpers (вызываются через supabase.rpc) ───────────────────────

-- Clients
CREATE OR REPLACE FUNCTION crm_re.get_clients(
  p_stage TEXT DEFAULT NULL,
  p_client_type TEXT DEFAULT NULL,
  p_source TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL
) RETURNS SETOF crm_re.clients LANGUAGE sql SECURITY DEFINER SET search_path = crm_re, public AS $$
  SELECT * FROM crm_re.clients
  WHERE user_id = auth.uid()
    AND (p_stage IS NULL OR stage = p_stage)
    AND (p_client_type IS NULL OR client_type = p_client_type)
    AND (p_source IS NULL OR source = p_source)
    AND (p_search IS NULL OR name ILIKE '%' || p_search || '%' OR phone ILIKE '%' || p_search || '%' OR email ILIKE '%' || p_search || '%')
  ORDER BY created_at DESC;
$$;

CREATE OR REPLACE FUNCTION crm_re.create_client(p_data JSONB)
RETURNS crm_re.clients LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm_re, public AS $$
DECLARE v_row crm_re.clients;
BEGIN
  INSERT INTO crm_re.clients (
    user_id, name, phone, email, telegram, whatsapp, client_type,
    budget_min, budget_max, deal_type, property_types, rooms_min, rooms_max,
    area_min, area_max, districts, metro_stations, mortgage_ready, mortgage_bank,
    mortgage_amount, source, source_detail, lead_score, stage, tags, notes,
    next_contact_at
  ) VALUES (
    auth.uid(),
    p_data->>'name', p_data->>'phone', p_data->>'email',
    p_data->>'telegram', p_data->>'whatsapp',
    COALESCE(p_data->>'client_type', 'buyer'),
    (p_data->>'budget_min')::BIGINT, (p_data->>'budget_max')::BIGINT,
    COALESCE(p_data->>'deal_type', 'sale'),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_data->'property_types')), '{}'),
    (p_data->>'rooms_min')::INT, (p_data->>'rooms_max')::INT,
    (p_data->>'area_min')::NUMERIC, (p_data->>'area_max')::NUMERIC,
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_data->'districts')), '{}'),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_data->'metro_stations')), '{}'),
    COALESCE((p_data->>'mortgage_ready')::BOOLEAN, FALSE),
    p_data->>'mortgage_bank', (p_data->>'mortgage_amount')::BIGINT,
    COALESCE(p_data->>'source', 'manual'), p_data->>'source_detail',
    COALESCE((p_data->>'lead_score')::INT, 0),
    COALESCE(p_data->>'stage', 'new'),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_data->'tags')), '{}'),
    p_data->>'notes',
    (p_data->>'next_contact_at')::TIMESTAMPTZ
  ) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION crm_re.update_client(p_id UUID, p_data JSONB)
RETURNS crm_re.clients LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm_re, public AS $$
DECLARE v_row crm_re.clients;
BEGIN
  UPDATE crm_re.clients SET
    name            = COALESCE(p_data->>'name', name),
    phone           = COALESCE(p_data->>'phone', phone),
    email           = COALESCE(p_data->>'email', email),
    telegram        = COALESCE(p_data->>'telegram', telegram),
    whatsapp        = COALESCE(p_data->>'whatsapp', whatsapp),
    client_type     = COALESCE(p_data->>'client_type', client_type),
    budget_min      = COALESCE((p_data->>'budget_min')::BIGINT, budget_min),
    budget_max      = COALESCE((p_data->>'budget_max')::BIGINT, budget_max),
    deal_type       = COALESCE(p_data->>'deal_type', deal_type),
    stage           = COALESCE(p_data->>'stage', stage),
    lead_score      = COALESCE((p_data->>'lead_score')::INT, lead_score),
    notes           = COALESCE(p_data->>'notes', notes),
    mortgage_ready  = COALESCE((p_data->>'mortgage_ready')::BOOLEAN, mortgage_ready),
    next_contact_at = COALESCE((p_data->>'next_contact_at')::TIMESTAMPTZ, next_contact_at),
    last_contact_at = COALESCE((p_data->>'last_contact_at')::TIMESTAMPTZ, last_contact_at),
    updated_at      = NOW()
  WHERE id = p_id AND user_id = auth.uid()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION crm_re.delete_client(p_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = crm_re, public AS $$
  DELETE FROM crm_re.clients WHERE id = p_id AND user_id = auth.uid();
$$;

-- Properties
CREATE OR REPLACE FUNCTION crm_re.get_properties(
  p_status TEXT DEFAULT NULL,
  p_property_type TEXT DEFAULT NULL,
  p_deal_type TEXT DEFAULT NULL,
  p_price_min BIGINT DEFAULT NULL,
  p_price_max BIGINT DEFAULT NULL,
  p_rooms INT DEFAULT NULL,
  p_district TEXT DEFAULT NULL
) RETURNS SETOF crm_re.properties LANGUAGE sql SECURITY DEFINER SET search_path = crm_re, public AS $$
  SELECT * FROM crm_re.properties
  WHERE user_id = auth.uid()
    AND (p_status IS NULL OR status = p_status)
    AND (p_property_type IS NULL OR property_type = p_property_type)
    AND (p_deal_type IS NULL OR deal_type = p_deal_type)
    AND (p_price_min IS NULL OR price >= p_price_min)
    AND (p_price_max IS NULL OR price <= p_price_max)
    AND (p_rooms IS NULL OR rooms = p_rooms)
    AND (p_district IS NULL OR district = p_district)
  ORDER BY created_at DESC;
$$;

CREATE OR REPLACE FUNCTION crm_re.create_property(p_data JSONB)
RETURNS crm_re.properties LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm_re, public AS $$
DECLARE v_row crm_re.properties;
BEGIN
  INSERT INTO crm_re.properties (
    user_id, title, property_type, deal_type, status,
    address, city, district, metro_station, metro_distance, lat, lng,
    rooms, floor, floors_total, area_total, area_living, area_kitchen,
    ceiling_height, year_built, renovation, balcony, parking,
    price, price_negotiable, mortgage_possible, mortgage_rate,
    commission_pct, commission_fixed, commission_who,
    photos, video_url, virtual_tour_url, floor_plan_url,
    published_cian, published_avito, published_yandex, published_domclick,
    seller_client_id, seller_name, seller_phone,
    description, features, notes
  ) VALUES (
    auth.uid(),
    p_data->>'title',
    COALESCE(p_data->>'property_type', 'apartment'),
    COALESCE(p_data->>'deal_type', 'sale'),
    COALESCE(p_data->>'status', 'available'),
    p_data->>'address', COALESCE(p_data->>'city', 'Москва'),
    p_data->>'district', p_data->>'metro_station',
    (p_data->>'metro_distance')::INT,
    (p_data->>'lat')::NUMERIC, (p_data->>'lng')::NUMERIC,
    (p_data->>'rooms')::INT, (p_data->>'floor')::INT,
    (p_data->>'floors_total')::INT, (p_data->>'area_total')::NUMERIC,
    (p_data->>'area_living')::NUMERIC, (p_data->>'area_kitchen')::NUMERIC,
    (p_data->>'ceiling_height')::NUMERIC, (p_data->>'year_built')::INT,
    p_data->>'renovation',
    COALESCE((p_data->>'balcony')::BOOLEAN, FALSE),
    p_data->>'parking',
    COALESCE((p_data->>'price')::BIGINT, 0),
    COALESCE((p_data->>'price_negotiable')::BOOLEAN, TRUE),
    COALESCE((p_data->>'mortgage_possible')::BOOLEAN, TRUE),
    (p_data->>'mortgage_rate')::NUMERIC,
    COALESCE((p_data->>'commission_pct')::NUMERIC, 2.0),
    (p_data->>'commission_fixed')::BIGINT,
    COALESCE(p_data->>'commission_who', 'buyer'),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_data->'photos')), '{}'),
    p_data->>'video_url', p_data->>'virtual_tour_url', p_data->>'floor_plan_url',
    COALESCE((p_data->>'published_cian')::BOOLEAN, FALSE),
    COALESCE((p_data->>'published_avito')::BOOLEAN, FALSE),
    COALESCE((p_data->>'published_yandex')::BOOLEAN, FALSE),
    COALESCE((p_data->>'published_domclick')::BOOLEAN, FALSE),
    (p_data->>'seller_client_id')::UUID,
    p_data->>'seller_name', p_data->>'seller_phone',
    p_data->>'description',
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_data->'features')), '{}'),
    p_data->>'notes'
  ) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION crm_re.update_property(p_id UUID, p_data JSONB)
RETURNS crm_re.properties LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm_re, public AS $$
DECLARE v_row crm_re.properties;
BEGIN
  UPDATE crm_re.properties SET
    title           = COALESCE(p_data->>'title', title),
    status          = COALESCE(p_data->>'status', status),
    price           = COALESCE((p_data->>'price')::BIGINT, price),
    address         = COALESCE(p_data->>'address', address),
    district        = COALESCE(p_data->>'district', district),
    rooms           = COALESCE((p_data->>'rooms')::INT, rooms),
    area_total      = COALESCE((p_data->>'area_total')::NUMERIC, area_total),
    floor           = COALESCE((p_data->>'floor')::INT, floor),
    description     = COALESCE(p_data->>'description', description),
    notes           = COALESCE(p_data->>'notes', notes),
    published_cian  = COALESCE((p_data->>'published_cian')::BOOLEAN, published_cian),
    published_avito = COALESCE((p_data->>'published_avito')::BOOLEAN, published_avito),
    published_yandex = COALESCE((p_data->>'published_yandex')::BOOLEAN, published_yandex),
    published_domclick = COALESCE((p_data->>'published_domclick')::BOOLEAN, published_domclick),
    avm_price       = COALESCE((p_data->>'avm_price')::BIGINT, avm_price),
    updated_at      = NOW()
  WHERE id = p_id AND user_id = auth.uid()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION crm_re.delete_property(p_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = crm_re, public AS $$
  DELETE FROM crm_re.properties WHERE id = p_id AND user_id = auth.uid();
$$;

-- Deals
CREATE OR REPLACE FUNCTION crm_re.get_deals(
  p_stage TEXT DEFAULT NULL,
  p_deal_type TEXT DEFAULT NULL
) RETURNS SETOF crm_re.deals LANGUAGE sql SECURITY DEFINER SET search_path = crm_re, public AS $$
  SELECT * FROM crm_re.deals
  WHERE user_id = auth.uid()
    AND (p_stage IS NULL OR stage = p_stage)
    AND (p_deal_type IS NULL OR deal_type = p_deal_type)
  ORDER BY created_at DESC;
$$;

CREATE OR REPLACE FUNCTION crm_re.create_deal(p_data JSONB)
RETURNS crm_re.deals LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm_re, public AS $$
DECLARE v_row crm_re.deals;
BEGIN
  INSERT INTO crm_re.deals (
    user_id, title, deal_type, stage, client_id, property_id,
    deal_price, commission_pct, commission_amount, deposit_amount,
    mortgage_bank, mortgage_amount, mortgage_rate, mortgage_term,
    source, notes, assigned_to
  ) VALUES (
    auth.uid(),
    p_data->>'title',
    COALESCE(p_data->>'deal_type', 'sale'),
    COALESCE(p_data->>'stage', 'new'),
    (p_data->>'client_id')::UUID,
    (p_data->>'property_id')::UUID,
    (p_data->>'deal_price')::BIGINT,
    (p_data->>'commission_pct')::NUMERIC,
    (p_data->>'commission_amount')::BIGINT,
    (p_data->>'deposit_amount')::BIGINT,
    p_data->>'mortgage_bank',
    (p_data->>'mortgage_amount')::BIGINT,
    (p_data->>'mortgage_rate')::NUMERIC,
    (p_data->>'mortgage_term')::INT,
    p_data->>'source',
    p_data->>'notes',
    (p_data->>'assigned_to')::UUID
  ) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION crm_re.update_deal(p_id UUID, p_data JSONB)
RETURNS crm_re.deals LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm_re, public AS $$
DECLARE v_row crm_re.deals;
BEGIN
  UPDATE crm_re.deals SET
    stage                = COALESCE(p_data->>'stage', stage),
    deal_price           = COALESCE((p_data->>'deal_price')::BIGINT, deal_price),
    commission_amount    = COALESCE((p_data->>'commission_amount')::BIGINT, commission_amount),
    mortgage_approved    = COALESCE((p_data->>'mortgage_approved')::BOOLEAN, mortgage_approved),
    mortgage_approved_at = COALESCE((p_data->>'mortgage_approved_at')::TIMESTAMPTZ, mortgage_approved_at),
    contract_signed_at   = COALESCE((p_data->>'contract_signed_at')::TIMESTAMPTZ, contract_signed_at),
    registration_date    = COALESCE((p_data->>'registration_date')::DATE, registration_date),
    keys_handover_date   = COALESCE((p_data->>'keys_handover_date')::DATE, keys_handover_date),
    won                  = COALESCE((p_data->>'won')::BOOLEAN, won),
    lost                 = COALESCE((p_data->>'lost')::BOOLEAN, lost),
    lost_reason          = COALESCE(p_data->>'lost_reason', lost_reason),
    notes                = COALESCE(p_data->>'notes', notes),
    updated_at           = NOW()
  WHERE id = p_id AND user_id = auth.uid()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION crm_re.delete_deal(p_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = crm_re, public AS $$
  DELETE FROM crm_re.deals WHERE id = p_id AND user_id = auth.uid();
$$;

-- Showings
CREATE OR REPLACE FUNCTION crm_re.get_showings(
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_status TEXT DEFAULT NULL
) RETURNS SETOF crm_re.showings LANGUAGE sql SECURITY DEFINER SET search_path = crm_re, public AS $$
  SELECT * FROM crm_re.showings
  WHERE user_id = auth.uid()
    AND (p_date_from IS NULL OR scheduled_at >= p_date_from)
    AND (p_date_to IS NULL OR scheduled_at <= p_date_to)
    AND (p_status IS NULL OR status = p_status)
  ORDER BY scheduled_at ASC;
$$;

CREATE OR REPLACE FUNCTION crm_re.create_showing(p_data JSONB)
RETURNS crm_re.showings LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm_re, public AS $$
DECLARE v_row crm_re.showings;
BEGIN
  INSERT INTO crm_re.showings (
    user_id, client_id, property_id, deal_id,
    scheduled_at, duration_min, status, route_order
  ) VALUES (
    auth.uid(),
    (p_data->>'client_id')::UUID,
    (p_data->>'property_id')::UUID,
    (p_data->>'deal_id')::UUID,
    (p_data->>'scheduled_at')::TIMESTAMPTZ,
    COALESCE((p_data->>'duration_min')::INT, 30),
    COALESCE(p_data->>'status', 'scheduled'),
    COALESCE((p_data->>'route_order')::INT, 1)
  ) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION crm_re.update_showing(p_id UUID, p_data JSONB)
RETURNS crm_re.showings LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm_re, public AS $$
DECLARE v_row crm_re.showings;
BEGIN
  UPDATE crm_re.showings SET
    status           = COALESCE(p_data->>'status', status),
    client_feedback  = COALESCE(p_data->>'client_feedback', client_feedback),
    client_notes     = COALESCE(p_data->>'client_notes', client_notes),
    agent_notes      = COALESCE(p_data->>'agent_notes', agent_notes),
    updated_at       = NOW()
  WHERE id = p_id AND user_id = auth.uid()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- Tasks
CREATE OR REPLACE FUNCTION crm_re.get_tasks(
  p_status TEXT DEFAULT NULL,
  p_priority TEXT DEFAULT NULL
) RETURNS SETOF crm_re.tasks LANGUAGE sql SECURITY DEFINER SET search_path = crm_re, public AS $$
  SELECT * FROM crm_re.tasks
  WHERE user_id = auth.uid()
    AND (p_status IS NULL OR status = p_status)
    AND (p_priority IS NULL OR priority = p_priority)
  ORDER BY due_date ASC NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION crm_re.create_task(p_data JSONB)
RETURNS crm_re.tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm_re, public AS $$
DECLARE v_row crm_re.tasks;
BEGIN
  INSERT INTO crm_re.tasks (
    user_id, title, task_type, priority, status,
    due_date, client_id, property_id, deal_id, notes
  ) VALUES (
    auth.uid(),
    p_data->>'title',
    COALESCE(p_data->>'task_type', 'call'),
    COALESCE(p_data->>'priority', 'medium'),
    COALESCE(p_data->>'status', 'pending'),
    (p_data->>'due_date')::TIMESTAMPTZ,
    (p_data->>'client_id')::UUID,
    (p_data->>'property_id')::UUID,
    (p_data->>'deal_id')::UUID,
    p_data->>'notes'
  ) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION crm_re.complete_task(p_id UUID)
RETURNS crm_re.tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm_re, public AS $$
DECLARE v_row crm_re.tasks;
BEGIN
  UPDATE crm_re.tasks SET
    status = 'completed', completed_at = NOW(), updated_at = NOW()
  WHERE id = p_id AND user_id = auth.uid()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION crm_re.delete_task(p_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = crm_re, public AS $$
  DELETE FROM crm_re.tasks WHERE id = p_id AND user_id = auth.uid();
$$;

-- Documents
CREATE OR REPLACE FUNCTION crm_re.get_documents(
  p_deal_id UUID DEFAULT NULL,
  p_client_id UUID DEFAULT NULL
) RETURNS SETOF crm_re.documents LANGUAGE sql SECURITY DEFINER SET search_path = crm_re, public AS $$
  SELECT * FROM crm_re.documents
  WHERE user_id = auth.uid()
    AND (p_deal_id IS NULL OR deal_id = p_deal_id)
    AND (p_client_id IS NULL OR client_id = p_client_id)
  ORDER BY created_at DESC;
$$;

CREATE OR REPLACE FUNCTION crm_re.create_document(p_data JSONB)
RETURNS crm_re.documents LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm_re, public AS $$
DECLARE v_row crm_re.documents;
BEGIN
  INSERT INTO crm_re.documents (
    user_id, deal_id, client_id, property_id,
    doc_type, title, file_url, signed, expires_at, notes
  ) VALUES (
    auth.uid(),
    (p_data->>'deal_id')::UUID,
    (p_data->>'client_id')::UUID,
    (p_data->>'property_id')::UUID,
    COALESCE(p_data->>'doc_type', 'other'),
    p_data->>'title',
    p_data->>'file_url',
    COALESCE((p_data->>'signed')::BOOLEAN, FALSE),
    (p_data->>'expires_at')::DATE,
    p_data->>'notes'
  ) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- District Analytics
CREATE OR REPLACE FUNCTION crm_re.get_district_analytics(p_city TEXT DEFAULT 'Москва')
RETURNS SETOF crm_re.district_analytics LANGUAGE sql SECURITY DEFINER SET search_path = crm_re, public AS $$
  SELECT * FROM crm_re.district_analytics WHERE city = p_city ORDER BY avg_price_sqm DESC;
$$;
