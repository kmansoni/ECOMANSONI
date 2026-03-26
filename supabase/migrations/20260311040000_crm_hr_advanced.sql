-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- =============================================================================
-- CRM HR Advanced — Talantix + Clickme + Dream Job + HRlink + Skillaz features
-- Implements:
--   • AI candidate scoring (Talantix-style requisition matching)
--   • Message templates — rejection, invitation, offer letters
--   • Onboarding checklists (Skillaz adaptation module)
--   • КЭДО document tracking (HRlink digital employment)
--   • Employer Brand metrics (Dream Job eNPS, rating)
--   • Job promotion budget tracking (Clickme analytics)
--   • Speed Hiring mode (Моя смена mass-hire)
--   • Auto-reminders / follow-up automation
-- =============================================================================

-- ─── MESSAGE TEMPLATES (шаблоны писем) ───────────────────────────────────────
-- Used for: rejections, invitations, offer letters, auto-answers
CREATE TABLE IF NOT EXISTS crm.hr_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name          TEXT NOT NULL,         -- "Отказ после скрининга", "Приглашение на интервью"
  category      TEXT NOT NULL DEFAULT 'rejection'
                CHECK (category IN (
                  'rejection',         -- отказное письмо
                  'invitation',        -- приглашение на интервью
                  'offer',             -- письмо оффера
                  'auto_reply',        -- автоответ на отклик
                  'follow_up',         -- follow-up через N дней
                  'onboarding',        -- письмо при выходе на работу
                  'custom'
                )),

  subject       TEXT,                  -- тема письма
  body          TEXT NOT NULL,         -- тело (поддерживает {{candidate_name}}, {{job_title}} etc.)
  -- Placeholders: {{candidate_name}}, {{job_title}}, {{company_name}},
  --               {{interview_date}}, {{interviewer_name}}, {{salary}}, {{start_date}}

  is_default    BOOLEAN DEFAULT false, -- использовать по умолчанию для категории
  send_channel  TEXT DEFAULT 'email'   -- email | telegram | both
                CHECK (send_channel IN ('email','telegram','both')),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE crm.hr_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_templates_owner ON crm.hr_templates
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Seed default templates
CREATE OR REPLACE FUNCTION crm.seed_hr_templates(p_user_id UUID DEFAULT auth.uid())
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO crm.hr_templates(user_id, name, category, subject, body, is_default) VALUES
  (p_user_id, 'Стандартный отказ', 'rejection',
   'Результат рассмотрения вашей кандидатуры — {{job_title}}',
   'Здравствуйте, {{candidate_name}}!

Благодарим вас за интерес к позиции {{job_title}}.

После рассмотрения вашей кандидатуры мы приняли решение продолжить поиск с другими соискателями. Мы сохраним ваше резюме в нашей базе и свяжемся, если откроются подходящие вакансии.

Желаем успехов в карьерных поисках!

С уважением,
HR-команда', true),

  (p_user_id, 'Приглашение на HR-звонок', 'invitation',
   'Приглашение на интервью — {{job_title}}',
   'Здравствуйте, {{candidate_name}}!

Мы рассмотрели ваше резюме на позицию {{job_title}} и хотели бы пригласить вас на короткий знакомственный звонок.

📅 Дата: {{interview_date}}
👤 Интервьюер: {{interviewer_name}}
💬 Формат: {{location}}

Пожалуйста, подтвердите удобство времени ответным сообщением.

С уважением,
{{company_name}}', true),

  (p_user_id, 'Оффер — поздравление', 'offer',
   'Предложение о работе — {{job_title}} в {{company_name}}',
   'Здравствуйте, {{candidate_name}}!

Рады сообщить, что мы хотели бы сделать вам предложение о работе на позицию {{job_title}}.

💰 Заработная плата: {{salary}} ₽
📅 Дата выхода: {{start_date}}
⏱ Испытательный срок: 3 месяца

Пожалуйста, дайте ответ до {{deadline}}. Если у вас есть вопросы — мы всегда на связи.

С радостью ждём вас в команде!
{{company_name}}', true),

  (p_user_id, 'Автоответ на отклик', 'auto_reply',
   'Мы получили ваш отклик — {{job_title}}',
   'Здравствуйте, {{candidate_name}}!

Спасибо за интерес к вакансии {{job_title}} в {{company_name}}.

Мы получили ваше резюме и рассмотрим его в течение 3-5 рабочих дней. Если ваша кандидатура подойдёт — свяжемся с вами для следующего шага.

С уважением,
HR-команда {{company_name}}', true),

  (p_user_id, 'Follow-up (нет ответа)', 'follow_up',
   'Уточнение по вашему отклику — {{job_title}}',
   'Здравствуйте, {{candidate_name}}!

Мы ранее писали вам по вакансии {{job_title}}, но не получили ответа.

Хотим уточнить — актуален ли для вас ещё этот вопрос? Мы готовы ответить на все ваши вопросы.

С уважением,
HR-команда', false)
  ON CONFLICT DO NOTHING;
END;
$$;

-- ─── ONBOARDING CHECKLISTS (Skillaz адаптация) ────────────────────────────────
-- Templates for onboarding tasks
CREATE TABLE IF NOT EXISTS crm.hr_onboarding_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,         -- "Стандартный онбординг разработчика"
  department    TEXT,
  tasks         JSONB NOT NULL DEFAULT '[]',
  -- JSON array of {title, day_offset, category, description, required}
  -- day_offset: когда выполнить (0=день выхода, 1=день 1, 7=неделя, 30=месяц)
  -- category: docs, access, intro, training, equipment, culture

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE crm.hr_onboarding_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_onboard_tpl_owner ON crm.hr_onboarding_templates
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Per-hire onboarding progress
CREATE TABLE IF NOT EXISTS crm.hr_onboarding (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id    UUID REFERENCES crm.hr_candidates(id) ON DELETE CASCADE,
  application_id  UUID REFERENCES crm.hr_applications(id) ON DELETE CASCADE,
  job_id          UUID REFERENCES crm.hr_jobs(id) ON DELETE SET NULL,

  start_date      DATE NOT NULL,         -- actual first day
  probation_end   DATE,                  -- end of probation
  buddy           TEXT,                  -- buddy/mentor name
  manager         TEXT,

  -- Status
  status          TEXT NOT NULL DEFAULT 'planned'
                  CHECK (status IN ('planned','in_progress','completed','failed')),

  -- Tasks JSON array matching template structure but with completion state
  tasks           JSONB NOT NULL DEFAULT '[]',
  -- Each task: {id, title, day_offset, category, required, completed, completed_at, notes}

  notes           TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_onboard_cand_idx ON crm.hr_onboarding(candidate_id);
ALTER TABLE crm.hr_onboarding ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_onboard_owner ON crm.hr_onboarding
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ─── КЭДО DOCUMENTS (HRlink digital employment) ───────────────────────────────
CREATE TABLE IF NOT EXISTS crm.hr_employment_docs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id    UUID REFERENCES crm.hr_candidates(id) ON DELETE CASCADE,
  application_id  UUID REFERENCES crm.hr_applications(id) ON DELETE SET NULL,

  doc_type        TEXT NOT NULL
                  CHECK (doc_type IN (
                    'offer_letter',          -- письмо-оффер
                    'employment_contract',   -- трудовой договор
                    'hire_order',            -- приказ о приёме (Т-1)
                    'nda',                   -- соглашение о конфиденциальности
                    'personal_data_consent', -- согласие на обработку ПДн
                    'probation_terms',       -- условия испытательного срока
                    'equipment_receipt',     -- акт выдачи оборудования
                    'remote_work_agreement', -- соглашение об удалённой работе
                    'other'
                  )),

  title           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','sent','signed','rejected','expired')),

  file_url        TEXT,                      -- ссылка на документ
  signed_url      TEXT,                      -- ссылка на подписанный вариант
  send_method     TEXT DEFAULT 'email'       -- email | gosuslugi | hrlink | manual
                  CHECK (send_method IN ('email','gosuslugi','hrlink','manual')),

  sent_at         TIMESTAMPTZ,
  signed_at       TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,               -- срок действия ссылки

  notes           TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_emp_docs_cand_idx ON crm.hr_employment_docs(candidate_id);
ALTER TABLE crm.hr_employment_docs ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_emp_docs_owner ON crm.hr_employment_docs
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ─── EMPLOYER BRAND / DREAM JOB METRICS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.hr_employer_brand (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  company_name          TEXT NOT NULL,
  industry              TEXT,

  -- eNPS (Employee Net Promoter Score) -100..+100
  enps_score            INT,
  enps_respondents      INT DEFAULT 0,
  enps_period           TEXT,               -- 'Q1 2026'

  -- Dream Job / отзывы
  dreamjob_rating       NUMERIC(3,2),       -- 1.0 - 5.0
  dreamjob_reviews      INT DEFAULT 0,
  positive_reviews_pct  INT,                -- % позитивных отзывов

  -- EVP (Employee Value Proposition) — что компания предлагает сотрудникам
  evp_items             JSONB DEFAULT '[]',
  -- [{category: 'comp', title: 'Конкурентный оффер', highlight: true}, ...]
  -- categories: comp (компенсации), culture (культура), growth (рост),
  --             work_life (баланс), mission (миссия), perks (льготы)

  -- Employer awards
  awards                TEXT[] DEFAULT '{}',  -- 'HR Brand 2025', 'Top-100 работодатель'

  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE crm.hr_employer_brand ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_brand_owner ON crm.hr_employer_brand
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ─── JOB PROMOTION BUDGET (Clickme analytics) ────────────────────────────────
-- Add promotion budget/analytics to hr_jobs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='crm' AND table_name='hr_jobs' AND column_name='promo_budget') THEN
    ALTER TABLE crm.hr_jobs ADD COLUMN promo_budget INT DEFAULT 0;   -- бюджет продвижения ₽
    ALTER TABLE crm.hr_jobs ADD COLUMN promo_spent  INT DEFAULT 0;   -- потрачено
    ALTER TABLE crm.hr_jobs ADD COLUMN views_count  INT DEFAULT 0;   -- просмотров
    ALTER TABLE crm.hr_jobs ADD COLUMN clicks_count INT DEFAULT 0;   -- кликов
    ALTER TABLE crm.hr_jobs ADD COLUMN responses_count INT DEFAULT 0; -- откликов
    -- CTR = clicks/views, Response rate = responses/clicks
  END IF;
END $$;

-- ─── AI CANDIDATE SCORING ────────────────────────────────────────────────────
-- Store AI match score per application (Talantix-style)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='crm' AND table_name='hr_applications' AND column_name='ai_score') THEN
    ALTER TABLE crm.hr_applications ADD COLUMN ai_score INT;       -- 0-100 % соответствия
    ALTER TABLE crm.hr_applications ADD COLUMN ai_verdict TEXT;    -- strong_match | good | weak | no_match
    ALTER TABLE crm.hr_applications ADD COLUMN ai_reasons JSONB DEFAULT '[]'; -- [{pro}, {con}]
    ALTER TABLE crm.hr_applications ADD COLUMN ai_scored_at TIMESTAMPTZ;
  END IF;
END $$;

-- ─── SPEED HIRING MODE (Моя смена) ────────────────────────────────────────────
-- Tag jobs as mass_hire with simplified pipeline
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='crm' AND table_name='hr_jobs' AND column_name='mass_hire') THEN
    ALTER TABLE crm.hr_jobs ADD COLUMN mass_hire BOOLEAN DEFAULT false;
    -- mass_hire jobs get simplified 3-stage pipeline: applied → verified → hired
    ALTER TABLE crm.hr_jobs ADD COLUMN target_hires INT DEFAULT 1;  -- сколько надо нанять
    ALTER TABLE crm.hr_jobs ADD COLUMN shift_type TEXT;             -- evening/night/weekend
  END IF;
END $$;

-- ─── FOLLOW-UP AUTOMATIONS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.hr_automations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id          UUID REFERENCES crm.hr_jobs(id) ON DELETE CASCADE,

  name            TEXT NOT NULL,
  trigger_event   TEXT NOT NULL
                  CHECK (trigger_event IN (
                    'stage_entered',      -- кандидат попал на стадию
                    'no_action_days',     -- нет действий N дней
                    'offer_sent',         -- оффер отправлен
                    'hired',              -- кандидат нанят
                    'rejection'           -- отказ
                  )),
  trigger_stage   TEXT,                   -- для stage_entered: какая стадия
  trigger_days    INT DEFAULT 3,          -- для no_action_days: через сколько дней

  action_type     TEXT NOT NULL
                  CHECK (action_type IN (
                    'send_template',      -- отправить шаблонное письмо
                    'create_task',        -- создать задачу рекрутеру
                    'move_stage',         -- переместить на другую стадию
                    'notify_recruiter'    -- уведомить рекрутера
                  )),
  template_id     UUID REFERENCES crm.hr_templates(id) ON DELETE SET NULL,
  action_stage    TEXT,                   -- для move_stage: куда переместить
  action_task     TEXT,                   -- для create_task: текст задачи

  active          BOOLEAN DEFAULT true,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE crm.hr_automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_auto_owner ON crm.hr_automations
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ─── RPC: TEMPLATES ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.get_hr_templates(p_category TEXT DEFAULT NULL)
RETURNS SETOF crm.hr_templates
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  SELECT * FROM crm.hr_templates
  WHERE user_id = auth.uid()
    AND (p_category IS NULL OR category = p_category)
  ORDER BY is_default DESC, created_at;
$$;

CREATE OR REPLACE FUNCTION crm.upsert_hr_template(
  p_name TEXT, p_category TEXT, p_subject TEXT, p_body TEXT,
  p_is_default BOOLEAN DEFAULT false, p_send_channel TEXT DEFAULT 'email',
  p_id UUID DEFAULT NULL
)
RETURNS crm.hr_templates
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  INSERT INTO crm.hr_templates(id, user_id, name, category, subject, body, is_default, send_channel)
  VALUES (COALESCE(p_id, gen_random_uuid()), auth.uid(), p_name, p_category, p_subject, p_body, p_is_default, p_send_channel)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, category = EXCLUDED.category,
    subject = EXCLUDED.subject, body = EXCLUDED.body,
    is_default = EXCLUDED.is_default, send_channel = EXCLUDED.send_channel,
    updated_at = NOW()
  RETURNING *;
$$;

-- ─── RPC: ONBOARDING ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.get_hr_onboarding(p_candidate_id UUID DEFAULT NULL)
RETURNS SETOF crm.hr_onboarding
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  SELECT * FROM crm.hr_onboarding
  WHERE user_id = auth.uid()
    AND (p_candidate_id IS NULL OR candidate_id = p_candidate_id)
  ORDER BY start_date DESC;
$$;

CREATE OR REPLACE FUNCTION crm.create_hr_onboarding(
  p_candidate_id UUID, p_application_id UUID, p_job_id UUID,
  p_start_date DATE, p_probation_end DATE DEFAULT NULL,
  p_buddy TEXT DEFAULT NULL, p_manager TEXT DEFAULT NULL
)
RETURNS crm.hr_onboarding
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  INSERT INTO crm.hr_onboarding(
    user_id, candidate_id, application_id, job_id,
    start_date, probation_end, buddy, manager,
    tasks
  ) VALUES (
    auth.uid(), p_candidate_id, p_application_id, p_job_id,
    p_start_date, p_probation_end, p_buddy, p_manager,
    jsonb_build_array(
      jsonb_build_object('id','t1','title','Подписание трудового договора','day_offset',0,'category','docs','required',true,'completed',false),
      jsonb_build_object('id','t2','title','Оформление согласия на обработку ПДн','day_offset',0,'category','docs','required',true,'completed',false),
      jsonb_build_object('id','t3','title','Выдача рабочего оборудования','day_offset',0,'category','equipment','required',true,'completed',false),
      jsonb_build_object('id','t4','title','Настройка доступов (почта, системы)','day_offset',1,'category','access','required',true,'completed',false),
      jsonb_build_object('id','t5','title','Знакомство с командой','day_offset',1,'category','intro','required',false,'completed',false),
      jsonb_build_object('id','t6','title','Введение в продукт/проект','day_offset',3,'category','training','required',true,'completed',false),
      jsonb_build_object('id','t7','title','Встреча с руководителем (1-on-1)','day_offset',7,'category','intro','required',true,'completed',false),
      jsonb_build_object('id','t8','title','Постановка целей испытательного срока','day_offset',7,'category','training','required',true,'completed',false),
      jsonb_build_object('id','t9','title','Промежуточная оценка (30 дней)','day_offset',30,'category','evaluation','required',true,'completed',false),
      jsonb_build_object('id','t10','title','Итоговая оценка испытательного срока','day_offset',90,'category','evaluation','required',true,'completed',false)
    )
  ) RETURNING *;
$$;

CREATE OR REPLACE FUNCTION crm.update_hr_onboarding_task(
  p_onboarding_id UUID,
  p_task_id TEXT,
  p_completed BOOLEAN,
  p_notes TEXT DEFAULT NULL
)
RETURNS crm.hr_onboarding
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE v_rec crm.hr_onboarding;
BEGIN
  UPDATE crm.hr_onboarding SET
    tasks = (
      SELECT jsonb_agg(
        CASE WHEN t->>'id' = p_task_id
          THEN t || jsonb_build_object(
            'completed', p_completed,
            'completed_at', CASE WHEN p_completed THEN NOW()::text ELSE NULL END,
            'notes', COALESCE(p_notes, t->>'notes')
          )
          ELSE t
        END
      )
      FROM jsonb_array_elements(tasks) t
    ),
    updated_at = NOW()
  WHERE id = p_onboarding_id AND user_id = auth.uid()
  RETURNING * INTO v_rec;
  RETURN v_rec;
END;
$$;

-- ─── RPC: EMPLOYMENT DOCS ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.get_hr_employment_docs(p_candidate_id UUID)
RETURNS SETOF crm.hr_employment_docs
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  SELECT * FROM crm.hr_employment_docs
  WHERE user_id = auth.uid() AND candidate_id = p_candidate_id
  ORDER BY created_at;
$$;

CREATE OR REPLACE FUNCTION crm.upsert_hr_employment_doc(
  p_candidate_id UUID, p_doc_type TEXT, p_title TEXT,
  p_status TEXT DEFAULT 'pending', p_send_method TEXT DEFAULT 'email',
  p_notes TEXT DEFAULT NULL, p_id UUID DEFAULT NULL
)
RETURNS crm.hr_employment_docs
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  INSERT INTO crm.hr_employment_docs(id, user_id, candidate_id, doc_type, title, status, send_method, notes)
  VALUES (COALESCE(p_id, gen_random_uuid()), auth.uid(), p_candidate_id, p_doc_type, p_title, p_status, p_send_method, p_notes)
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status, send_method = EXCLUDED.send_method,
    notes = EXCLUDED.notes,
    sent_at  = CASE WHEN EXCLUDED.status = 'sent' THEN NOW() ELSE crm.hr_employment_docs.sent_at END,
    signed_at = CASE WHEN EXCLUDED.status = 'signed' THEN NOW() ELSE crm.hr_employment_docs.signed_at END,
    updated_at = NOW()
  RETURNING *;
$$;

-- ─── RPC: AI SCORING ─────────────────────────────────────────────────────────
-- Compute candidate ↔ job match score based on skills overlap
CREATE OR REPLACE FUNCTION crm.compute_hr_ai_score(p_application_id UUID)
RETURNS crm.hr_applications
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE
  v_app  crm.hr_applications;
  v_job  crm.hr_jobs;
  v_cand crm.hr_candidates;
  v_req_skills TEXT[];
  v_cand_skills TEXT[];
  v_matched INT := 0;
  v_total INT;
  v_score INT;
  v_verdict TEXT;
  v_reasons JSONB := '[]';
BEGIN
  SELECT * INTO v_app  FROM crm.hr_applications WHERE id = p_application_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN v_app; END IF;

  SELECT * INTO v_job  FROM crm.hr_jobs       WHERE id = v_app.job_id;
  SELECT * INTO v_cand FROM crm.hr_candidates  WHERE id = v_app.candidate_id;

  v_req_skills  := COALESCE(v_job.required_skills, '{}');
  v_cand_skills := COALESCE(v_cand.skills, '{}');
  v_total       := array_length(v_req_skills, 1);

  IF v_total IS NULL OR v_total = 0 THEN
    v_score := 50; v_verdict := 'good';
  ELSE
    -- Count case-insensitive matches
    SELECT COUNT(*) INTO v_matched
    FROM unnest(v_req_skills) rs
    WHERE EXISTS (SELECT 1 FROM unnest(v_cand_skills) cs WHERE lower(cs) LIKE '%' || lower(rs) || '%' OR lower(rs) LIKE '%' || lower(cs) || '%');

    v_score := LEAST(100, ROUND(v_matched::NUMERIC / v_total * 100 +
      CASE WHEN v_cand.grade IS NOT NULL AND v_job.grade IS NOT NULL
           AND v_cand.grade = v_job.grade THEN 10 ELSE 0 END +
      CASE WHEN v_cand.expected_salary IS NOT NULL AND v_job.salary_max IS NOT NULL
           AND v_cand.expected_salary <= v_job.salary_max THEN 5 ELSE 0 END
    )::INT);

    v_verdict := CASE
      WHEN v_score >= 80 THEN 'strong_match'
      WHEN v_score >= 60 THEN 'good'
      WHEN v_score >= 40 THEN 'weak'
      ELSE 'no_match'
    END;

    -- Build reasons
    SELECT jsonb_agg(jsonb_build_object('type','pro','text','Навык: ' || rs))
    INTO v_reasons
    FROM unnest(v_req_skills) rs
    WHERE EXISTS (SELECT 1 FROM unnest(v_cand_skills) cs WHERE lower(cs) LIKE '%' || lower(rs) || '%');

    v_reasons := COALESCE(v_reasons, '[]');
  END IF;

  UPDATE crm.hr_applications SET
    ai_score      = v_score,
    ai_verdict    = v_verdict,
    ai_reasons    = v_reasons,
    ai_scored_at  = NOW()
  WHERE id = p_application_id AND user_id = auth.uid()
  RETURNING * INTO v_app;

  RETURN v_app;
END;
$$;

-- ─── RPC: EMPLOYER BRAND ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.upsert_employer_brand(
  p_company_name TEXT,
  p_enps_score INT DEFAULT NULL,
  p_dreamjob_rating NUMERIC DEFAULT NULL,
  p_evp_items JSONB DEFAULT '[]',
  p_awards TEXT[] DEFAULT '{}'
)
RETURNS crm.hr_employer_brand
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  INSERT INTO crm.hr_employer_brand(user_id, company_name, enps_score, dreamjob_rating, evp_items, awards)
  VALUES (auth.uid(), p_company_name, p_enps_score, p_dreamjob_rating, p_evp_items, p_awards)
  ON CONFLICT (user_id) DO UPDATE SET
    company_name     = EXCLUDED.company_name,
    enps_score       = COALESCE(EXCLUDED.enps_score, crm.hr_employer_brand.enps_score),
    dreamjob_rating  = COALESCE(EXCLUDED.dreamjob_rating, crm.hr_employer_brand.dreamjob_rating),
    evp_items        = EXCLUDED.evp_items,
    awards           = EXCLUDED.awards,
    updated_at       = NOW()
  RETURNING *;
$$;

-- Add unique constraint for employer brand
ALTER TABLE crm.hr_employer_brand DROP CONSTRAINT IF EXISTS hr_brand_user_unique;
ALTER TABLE crm.hr_employer_brand ADD CONSTRAINT hr_brand_user_unique UNIQUE (user_id);

-- ─── UPDATED_AT TRIGGERS ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_hr_templates_updated_at') THEN
    CREATE TRIGGER trg_hr_templates_updated_at BEFORE UPDATE ON crm.hr_templates
      FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_hr_onboard_updated_at') THEN
    CREATE TRIGGER trg_hr_onboard_updated_at BEFORE UPDATE ON crm.hr_onboarding
      FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_hr_emp_docs_updated_at') THEN
    CREATE TRIGGER trg_hr_emp_docs_updated_at BEFORE UPDATE ON crm.hr_employment_docs
      FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();
  END IF;
END $$;
