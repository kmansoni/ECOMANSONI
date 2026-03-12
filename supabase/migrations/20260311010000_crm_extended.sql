-- ============================================================
-- CRM Extended: Компании, Лиды, Подзадачи, Автоматизация,
-- Документы, Каталог товаров, Поиск, Импорт
-- Date: 2026-03-11
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Компании (юрлица)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.companies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profession      VARCHAR(100) NOT NULL DEFAULT 'default',
  name            TEXT NOT NULL,
  inn             TEXT,
  kpp             TEXT,
  ogrn            TEXT,
  legal_address   TEXT,
  actual_address  TEXT,
  website         TEXT,
  phone           TEXT,
  email           TEXT,
  industry        TEXT,
  employee_count  INTEGER,
  annual_revenue  DECIMAL(15,2),
  currency        VARCHAR(10) DEFAULT 'RUB',
  description     TEXT,
  tags            TEXT[] DEFAULT '{}',
  custom_fields   JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_companies_user_id ON crm.companies(user_id);
CREATE INDEX idx_crm_companies_name ON crm.companies USING gin(to_tsvector('russian', name));

ALTER TABLE crm.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_companies_owner" ON crm.companies FOR ALL USING (auth.uid() = user_id);

-- Добавляем company_id к клиентам
ALTER TABLE crm.clients ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES crm.companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_crm_clients_company ON crm.clients(company_id);

-- ─────────────────────────────────────────────────────────────
-- 2. Лиды (неквалифицированные обращения)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profession      VARCHAR(100) NOT NULL DEFAULT 'default',
  name            TEXT NOT NULL,
  phone           TEXT,
  email           TEXT,
  source          TEXT CHECK (source IN ('manual', 'website', 'social', 'referral', 'cold_call', 'email', 'messenger', 'other')),
  source_detail   TEXT,
  status          TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_work', 'qualified', 'unqualified', 'converted')),
  budget          DECIMAL(15,2),
  currency        VARCHAR(10) DEFAULT 'RUB',
  notes           TEXT,
  tags            TEXT[] DEFAULT '{}',
  custom_fields   JSONB DEFAULT '{}',
  -- Конвертация
  converted_at    TIMESTAMPTZ,
  converted_client_id UUID REFERENCES crm.clients(id) ON DELETE SET NULL,
  converted_deal_id   UUID REFERENCES crm.deals(id) ON DELETE SET NULL,
  -- Мессенджер
  messenger_conversation_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_leads_user_id ON crm.leads(user_id, profession);
CREATE INDEX idx_crm_leads_status ON crm.leads(status);
CREATE INDEX idx_crm_leads_source ON crm.leads(source);
CREATE INDEX idx_crm_leads_fts ON crm.leads USING gin(to_tsvector('russian', name || ' ' || COALESCE(phone, '') || ' ' || COALESCE(email, '')));

ALTER TABLE crm.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_leads_owner" ON crm.leads FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 3. Подзадачи (иерархия задач)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE crm.tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES crm.tasks(id) ON DELETE CASCADE;
ALTER TABLE crm.tasks ADD COLUMN IF NOT EXISTS checklist JSONB DEFAULT '[]'; -- [{id, text, done}]
ALTER TABLE crm.tasks ADD COLUMN IF NOT EXISTS time_spent_seconds INTEGER DEFAULT 0;
ALTER TABLE crm.tasks ADD COLUMN IF NOT EXISTS estimated_seconds INTEGER;
ALTER TABLE crm.tasks ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;
ALTER TABLE crm.tasks ADD COLUMN IF NOT EXISTS recurrence_rule TEXT; -- RRULE format
ALTER TABLE crm.tasks ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES crm.leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_tasks_parent ON crm.tasks(parent_task_id);

-- ─────────────────────────────────────────────────────────────
-- 4. Автоматизация (роботы/триггеры)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.automation_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profession      VARCHAR(100) NOT NULL DEFAULT 'default',
  name            TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  -- Триггер
  trigger_entity  TEXT NOT NULL CHECK (trigger_entity IN ('deal', 'lead', 'client', 'task')),
  trigger_event   TEXT NOT NULL CHECK (trigger_event IN ('created', 'stage_changed', 'field_changed', 'overdue', 'won', 'lost')),
  trigger_conditions JSONB DEFAULT '{}', -- {field: 'stage', value: 'proposal'}
  -- Действие
  action_type     TEXT NOT NULL CHECK (action_type IN ('create_task', 'send_message', 'change_stage', 'assign_user', 'send_email', 'add_tag', 'create_deal')),
  action_params   JSONB NOT NULL DEFAULT '{}',
  -- Задержка
  delay_seconds   INTEGER DEFAULT 0,
  -- Статистика
  run_count       INTEGER DEFAULT 0,
  last_run_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_automation_user ON crm.automation_rules(user_id, is_active);
CREATE INDEX idx_crm_automation_trigger ON crm.automation_rules(trigger_entity, trigger_event);

ALTER TABLE crm.automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_automation_owner" ON crm.automation_rules FOR ALL USING (auth.uid() = user_id);

-- Лог выполнения автоматизаций
CREATE TABLE IF NOT EXISTS crm.automation_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id         UUID NOT NULL REFERENCES crm.automation_rules(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL,
  entity_id       UUID NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  error_message   TEXT,
  executed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_automation_log_rule ON crm.automation_log(rule_id, executed_at DESC);

ALTER TABLE crm.automation_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_automation_log_owner" ON crm.automation_log FOR SELECT USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 5. Каталог товаров CRM
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profession      VARCHAR(100) NOT NULL DEFAULT 'default',
  name            TEXT NOT NULL,
  sku             TEXT,
  description     TEXT,
  price           DECIMAL(15,2) NOT NULL DEFAULT 0,
  currency        VARCHAR(10) DEFAULT 'RUB',
  unit            TEXT DEFAULT 'шт',
  vat_rate        DECIMAL(5,2) DEFAULT 20, -- НДС %
  is_active       BOOLEAN DEFAULT true,
  category        TEXT,
  custom_fields   JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_products_user ON crm.products(user_id, is_active);

ALTER TABLE crm.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_products_owner" ON crm.products FOR ALL USING (auth.uid() = user_id);

-- Позиции в сделке
CREATE TABLE IF NOT EXISTS crm.deal_products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id     UUID NOT NULL REFERENCES crm.deals(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES crm.products(id) ON DELETE SET NULL,
  name        TEXT NOT NULL, -- snapshot на момент добавления
  quantity    DECIMAL(10,3) NOT NULL DEFAULT 1,
  price       DECIMAL(15,2) NOT NULL,
  discount    DECIMAL(5,2) DEFAULT 0, -- %
  vat_rate    DECIMAL(5,2) DEFAULT 20,
  total       DECIMAL(15,2) GENERATED ALWAYS AS (quantity * price * (1 - discount/100)) STORED,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_deal_products_deal ON crm.deal_products(deal_id);

ALTER TABLE crm.deal_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_deal_products_owner" ON crm.deal_products
  FOR ALL USING (
    EXISTS (SELECT 1 FROM crm.deals WHERE id = deal_id AND user_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────
-- 6. Документы (счета, КП, договоры)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id         UUID REFERENCES crm.deals(id) ON DELETE SET NULL,
  client_id       UUID REFERENCES crm.clients(id) ON DELETE SET NULL,
  company_id      UUID REFERENCES crm.companies(id) ON DELETE SET NULL,
  doc_type        TEXT NOT NULL CHECK (doc_type IN ('invoice', 'proposal', 'contract', 'act', 'other')),
  number          TEXT NOT NULL,
  title           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'signed', 'paid', 'cancelled')),
  amount          DECIMAL(15,2),
  currency        VARCHAR(10) DEFAULT 'RUB',
  due_date        DATE,
  file_url        TEXT,
  template_id     UUID,
  content         JSONB DEFAULT '{}', -- данные для шаблона
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_documents_user ON crm.documents(user_id, doc_type);
CREATE INDEX idx_crm_documents_deal ON crm.documents(deal_id);

ALTER TABLE crm.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_documents_owner" ON crm.documents FOR ALL USING (auth.uid() = user_id);

-- Шаблоны документов
CREATE TABLE IF NOT EXISTS crm.document_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  doc_type    TEXT NOT NULL,
  content     TEXT NOT NULL, -- HTML/Markdown шаблон с {{переменными}}
  is_default  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE crm.document_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_doc_templates_owner" ON crm.document_templates FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 7. Множественные воронки
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.pipelines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profession  VARCHAR(100) NOT NULL DEFAULT 'default',
  name        TEXT NOT NULL,
  stages      JSONB NOT NULL DEFAULT '[]', -- [{id, name, color, probability, is_won, is_lost}]
  is_default  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE crm.deals ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES crm.pipelines(id) ON DELETE SET NULL;

ALTER TABLE crm.pipelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_pipelines_owner" ON crm.pipelines FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 8. Full-text search индексы
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_crm_clients_fts ON crm.clients
  USING gin(to_tsvector('russian', name || ' ' || COALESCE(phone, '') || ' ' || COALESCE(email, '') || ' ' || COALESCE(company, '')));

CREATE INDEX IF NOT EXISTS idx_crm_deals_fts ON crm.deals
  USING gin(to_tsvector('russian', title || ' ' || COALESCE(description, '')));

-- ─────────────────────────────────────────────────────────────
-- 9. Теги (централизованное хранение)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT DEFAULT '#6B7280',
  entity_type TEXT NOT NULL CHECK (entity_type IN ('client', 'deal', 'lead', 'task')),
  UNIQUE (user_id, name, entity_type)
);

ALTER TABLE crm.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_tags_owner" ON crm.tags FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 10. Обновление triggers для updated_at
-- ─────────────────────────────────────────────────────────────
CREATE TRIGGER update_crm_companies_updated_at
  BEFORE UPDATE ON crm.companies
  FOR EACH ROW EXECUTE FUNCTION crm.update_updated_at_column();

CREATE TRIGGER update_crm_leads_updated_at
  BEFORE UPDATE ON crm.leads
  FOR EACH ROW EXECUTE FUNCTION crm.update_updated_at_column();

CREATE TRIGGER update_crm_automation_rules_updated_at
  BEFORE UPDATE ON crm.automation_rules
  FOR EACH ROW EXECUTE FUNCTION crm.update_updated_at_column();

CREATE TRIGGER update_crm_products_updated_at
  BEFORE UPDATE ON crm.products
  FOR EACH ROW EXECUTE FUNCTION crm.update_updated_at_column();

CREATE TRIGGER update_crm_documents_updated_at
  BEFORE UPDATE ON crm.documents
  FOR EACH ROW EXECUTE FUNCTION crm.update_updated_at_column();
