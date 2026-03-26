-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- =============================================================================
-- CRM HR / Recruiting Full Schema
-- Implements: job requisitions, candidate profiles, ATS pipeline,
--             interviews with scorecards, offer management, HR analytics
-- Based on: hh.ru, rabota.ru, SuperJob, Greenhouse, Lever, Workday ATS
-- =============================================================================

-- ─── JOB REQUISITIONS (вакансии) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.hr_jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  title             TEXT NOT NULL,               -- "Backend Developer"
  department        TEXT,                        -- "Разработка", "Маркетинг"
  team              TEXT,                        -- "Core Platform"
  location          TEXT,                        -- "Москва", "Удалённо"

  -- Employment
  employment_type   TEXT NOT NULL DEFAULT 'full_time'
                    CHECK (employment_type IN ('full_time','part_time','remote','hybrid','contract','internship','freelance')),
  grade             TEXT CHECK (grade IN ('intern','junior','middle','senior','lead','principal','director','head','vp','cxo')),

  -- Salary
  salary_min        INT,                         -- в рублях
  salary_max        INT,
  salary_currency   TEXT DEFAULT 'RUB',
  salary_gross      BOOLEAN DEFAULT true,        -- gross/net
  salary_hidden     BOOLEAN DEFAULT false,

  -- Requirements
  required_skills   TEXT[] DEFAULT '{}',
  preferred_skills  TEXT[] DEFAULT '{}',
  experience_min    NUMERIC(3,1),               -- лет опыта
  experience_max    NUMERIC(3,1),
  english_level     TEXT CHECK (english_level IN ('none','basic','pre_intermediate','intermediate','upper_intermediate','advanced','fluent')),
  education_level   TEXT,                        -- "высшее", "среднее"

  -- Description
  description       TEXT,
  responsibilities  TEXT,
  conditions        TEXT,

  -- Status & priority
  status            TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('draft','open','paused','closed','archived')),
  priority          TEXT NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('low','normal','high','urgent')),
  openings          INT DEFAULT 1,               -- количество открытых позиций
  hiring_manager    TEXT,                        -- имя заказчика вакансии

  -- Sources published
  published_sources TEXT[] DEFAULT '{}',         -- ['hh_ru','superjob','linkedin','telegram']

  -- Dates
  deadline          DATE,
  closed_at         TIMESTAMPTZ,

  custom_fields     JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_hr_jobs_user_idx   ON crm.hr_jobs(user_id);
CREATE INDEX IF NOT EXISTS crm_hr_jobs_status_idx ON crm.hr_jobs(status);

ALTER TABLE crm.hr_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_hr_jobs_owner ON crm.hr_jobs
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ─── CANDIDATES (кандидаты) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.hr_candidates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id         UUID REFERENCES crm.clients(id) ON DELETE SET NULL,

  -- Personal
  name              TEXT NOT NULL,
  photo_url         TEXT,
  phone             TEXT,
  email             TEXT,
  telegram_handle   TEXT,
  linkedin_url      TEXT,
  portfolio_url     TEXT,
  resume_url        TEXT,

  -- Current position
  current_company   TEXT,
  current_position  TEXT,
  current_salary    INT,                         -- текущая ЗП
  expected_salary   INT,                         -- желаемая ЗП
  salary_currency   TEXT DEFAULT 'RUB',
  salary_negotiable BOOLEAN DEFAULT true,

  -- Experience & qualifications
  experience_years  NUMERIC(3,1),
  grade             TEXT,                        -- junior/middle/senior/lead
  skills            TEXT[] DEFAULT '{}',
  english_level     TEXT,
  education_level   TEXT,
  university        TEXT,
  graduation_year   INT,

  -- Location & work preference
  city              TEXT,
  willing_to_relocate BOOLEAN DEFAULT false,
  work_format       TEXT CHECK (work_format IN ('office','remote','hybrid','any')),

  -- Sourcing
  source            TEXT DEFAULT 'direct',
  -- direct, hh_ru, superjob, rabota_ru, linkedin, telegram, referral, headhunting, website

  -- Status & flags
  blacklisted       BOOLEAN DEFAULT false,
  blacklist_reason  TEXT,
  vip               BOOLEAN DEFAULT false,       -- звёздочка/избранный кандидат

  -- Notes & tags
  tags              TEXT[] DEFAULT '{}',
  notes             TEXT,

  custom_fields     JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_cands_user_idx    ON crm.hr_candidates(user_id);
CREATE INDEX IF NOT EXISTS crm_cands_source_idx  ON crm.hr_candidates(source);
CREATE INDEX IF NOT EXISTS crm_cands_bl_idx      ON crm.hr_candidates(blacklisted);

ALTER TABLE crm.hr_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_cands_owner ON crm.hr_candidates
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ─── APPLICATIONS / PIPELINE (отклики + воронка) ─────────────────────────────
-- Связка кандидат ↔ вакансия с историей стадий
CREATE TABLE IF NOT EXISTS crm.hr_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id          UUID NOT NULL REFERENCES crm.hr_jobs(id) ON DELETE CASCADE,
  candidate_id    UUID NOT NULL REFERENCES crm.hr_candidates(id) ON DELETE CASCADE,

  -- Pipeline stage
  stage           TEXT NOT NULL DEFAULT 'new'
                  CHECK (stage IN (
                    'new',          -- новый отклик
                    'screening',    -- скрининг резюме
                    'hr_call',      -- звонок с HR
                    'tech_screen',  -- техническое интервью / скрин
                    'interview',    -- интервью с нанимателем
                    'final_interview', -- финальное интервью
                    'test_task',    -- тестовое задание
                    'offer',        -- оффер выставлен
                    'hired',        -- принят
                    'rejected',     -- отказ
                    'archived'      -- архив
                  )),

  -- Stage history (for time-to-hire analytics) — append-only via trigger
  stage_entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  days_in_stage   INT NOT NULL DEFAULT 0,

  -- Rejection
  reject_stage    TEXT,            -- на какой стадии отказали
  reject_reason   TEXT,
  -- hh стандарт: "не подходит опыт", "нет открытой позиции", "принят другой кандидат",
  --              "нет ответа от кандидата", "оффер не принят", "другое"

  -- Score (1-5) заполняется после интервью
  score           INT CHECK (score BETWEEN 1 AND 5),
  score_notes     TEXT,

  -- Cover / notes
  cover_letter    TEXT,
  recruiter_notes TEXT,

  -- Dates
  applied_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hired_at        TIMESTAMPTZ,

  custom_fields   JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(job_id, candidate_id)     -- один кандидат — одна заявка на вакансию
);

CREATE INDEX IF NOT EXISTS crm_apps_user_idx  ON crm.hr_applications(user_id);
CREATE INDEX IF NOT EXISTS crm_apps_job_idx   ON crm.hr_applications(job_id);
CREATE INDEX IF NOT EXISTS crm_apps_cand_idx  ON crm.hr_applications(candidate_id);
CREATE INDEX IF NOT EXISTS crm_apps_stage_idx ON crm.hr_applications(stage);

ALTER TABLE crm.hr_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_apps_owner ON crm.hr_applications
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ─── INTERVIEWS (интервью) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.hr_interviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id  UUID NOT NULL REFERENCES crm.hr_applications(id) ON DELETE CASCADE,
  candidate_id    UUID NOT NULL REFERENCES crm.hr_candidates(id) ON DELETE CASCADE,
  job_id          UUID NOT NULL REFERENCES crm.hr_jobs(id) ON DELETE CASCADE,

  interview_type  TEXT NOT NULL DEFAULT 'hr_call'
                  CHECK (interview_type IN ('hr_call','tech_screen','hiring_manager','final','test_task','bar_raiser')),

  scheduled_at    TIMESTAMPTZ NOT NULL,
  duration_min    INT DEFAULT 60,
  location        TEXT,              -- "Zoom", "Офис", "Telegram"
  meeting_link    TEXT,
  interviewers    TEXT[] DEFAULT '{}',

  -- Status
  status          TEXT NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled','completed','cancelled','no_show','rescheduled')),

  -- Scorecard — JSON array of {competency, score 1-5, comment}
  scorecard       JSONB DEFAULT '[]',
  overall_score   INT CHECK (overall_score BETWEEN 1 AND 5),

  -- Recommendation
  recommendation  TEXT CHECK (recommendation IN ('strong_yes','yes','no','strong_no','hold')),
  feedback        TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_interviews_app_idx  ON crm.hr_interviews(application_id);
CREATE INDEX IF NOT EXISTS crm_interviews_date_idx ON crm.hr_interviews(scheduled_at);

ALTER TABLE crm.hr_interviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_interviews_owner ON crm.hr_interviews
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ─── OFFERS (офферы) ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.hr_offers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id  UUID NOT NULL REFERENCES crm.hr_applications(id) ON DELETE CASCADE,
  candidate_id    UUID REFERENCES crm.hr_candidates(id) ON DELETE SET NULL,
  job_id          UUID REFERENCES crm.hr_jobs(id) ON DELETE SET NULL,

  -- Offer terms
  offered_salary  INT NOT NULL,
  salary_currency TEXT DEFAULT 'RUB',
  salary_gross    BOOLEAN DEFAULT true,
  start_date      DATE,
  probation_months INT DEFAULT 3,              -- испытательный срок
  bonuses         TEXT,                        -- описание бонусов, ДМС и т.д.
  offer_text      TEXT,                        -- полный текст оффера

  -- Status
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','sent','accepted','declined','withdrawn','expired')),

  -- Dates
  sent_at         TIMESTAMPTZ,
  deadline        DATE,                        -- срок принятия оффера
  accepted_at     TIMESTAMPTZ,
  declined_at     TIMESTAMPTZ,
  decline_reason  TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE crm.hr_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_offers_owner ON crm.hr_offers
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ─── STAGE HISTORY LOG ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.hr_stage_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES crm.hr_applications(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_stage      TEXT,
  to_stage        TEXT NOT NULL,
  moved_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS crm_stage_hist_app_idx ON crm.hr_stage_history(application_id);
ALTER TABLE crm.hr_stage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_stage_hist_owner ON crm.hr_stage_history
  USING (user_id = auth.uid());

-- ─── RPC: HR JOBS ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.get_hr_jobs(p_status TEXT DEFAULT NULL)
RETURNS SETOF crm.hr_jobs
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  SELECT * FROM crm.hr_jobs
  WHERE user_id = auth.uid()
    AND (p_status IS NULL OR status = p_status)
  ORDER BY
    CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
    created_at DESC;
$$;

CREATE OR REPLACE FUNCTION crm.create_hr_job(
  p_title TEXT,
  p_department TEXT DEFAULT NULL,
  p_team TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_employment_type TEXT DEFAULT 'full_time',
  p_grade TEXT DEFAULT NULL,
  p_salary_min INT DEFAULT NULL,
  p_salary_max INT DEFAULT NULL,
  p_salary_hidden BOOLEAN DEFAULT false,
  p_required_skills TEXT[] DEFAULT '{}',
  p_preferred_skills TEXT[] DEFAULT '{}',
  p_experience_min NUMERIC DEFAULT NULL,
  p_english_level TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_responsibilities TEXT DEFAULT NULL,
  p_conditions TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'open',
  p_priority TEXT DEFAULT 'normal',
  p_openings INT DEFAULT 1,
  p_hiring_manager TEXT DEFAULT NULL,
  p_deadline DATE DEFAULT NULL
)
RETURNS crm.hr_jobs
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  INSERT INTO crm.hr_jobs(
    user_id, title, department, team, location, employment_type, grade,
    salary_min, salary_max, salary_hidden, required_skills, preferred_skills,
    experience_min, english_level, description, responsibilities, conditions,
    status, priority, openings, hiring_manager, deadline
  ) VALUES (
    auth.uid(), p_title, p_department, p_team, p_location, p_employment_type, p_grade,
    p_salary_min, p_salary_max, p_salary_hidden, p_required_skills, p_preferred_skills,
    p_experience_min, p_english_level, p_description, p_responsibilities, p_conditions,
    p_status, p_priority, p_openings, p_hiring_manager, p_deadline
  ) RETURNING *;
$$;

CREATE OR REPLACE FUNCTION crm.update_hr_job(
  p_id UUID,
  p_title TEXT DEFAULT NULL,
  p_department TEXT DEFAULT NULL,
  p_grade TEXT DEFAULT NULL,
  p_salary_min INT DEFAULT NULL,
  p_salary_max INT DEFAULT NULL,
  p_required_skills TEXT[] DEFAULT NULL,
  p_preferred_skills TEXT[] DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_priority TEXT DEFAULT NULL,
  p_openings INT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_conditions TEXT DEFAULT NULL,
  p_deadline DATE DEFAULT NULL
)
RETURNS crm.hr_jobs
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  UPDATE crm.hr_jobs SET
    title            = COALESCE(p_title, title),
    department       = COALESCE(p_department, department),
    grade            = COALESCE(p_grade, grade),
    salary_min       = COALESCE(p_salary_min, salary_min),
    salary_max       = COALESCE(p_salary_max, salary_max),
    required_skills  = COALESCE(p_required_skills, required_skills),
    preferred_skills = COALESCE(p_preferred_skills, preferred_skills),
    status           = COALESCE(p_status, status),
    priority         = COALESCE(p_priority, priority),
    openings         = COALESCE(p_openings, openings),
    description      = COALESCE(p_description, description),
    conditions       = COALESCE(p_conditions, conditions),
    deadline         = COALESCE(p_deadline, deadline),
    updated_at       = NOW(),
    closed_at        = CASE WHEN p_status IN ('closed','archived') THEN NOW() ELSE closed_at END
  WHERE id = p_id AND user_id = auth.uid()
  RETURNING *;
$$;

CREATE OR REPLACE FUNCTION crm.delete_hr_job(p_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  DELETE FROM crm.hr_jobs WHERE id = p_id AND user_id = auth.uid() RETURNING TRUE;
$$;

-- ─── RPC: CANDIDATES ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.get_hr_candidates(
  p_blacklisted BOOLEAN DEFAULT false,
  p_job_id UUID DEFAULT NULL
)
RETURNS SETOF crm.hr_candidates
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  SELECT DISTINCT c.* FROM crm.hr_candidates c
  LEFT JOIN crm.hr_applications a ON a.candidate_id = c.id AND a.user_id = auth.uid()
  WHERE c.user_id = auth.uid()
    AND c.blacklisted = p_blacklisted
    AND (p_job_id IS NULL OR a.job_id = p_job_id)
  ORDER BY c.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION crm.create_hr_candidate(
  p_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_telegram_handle TEXT DEFAULT NULL,
  p_linkedin_url TEXT DEFAULT NULL,
  p_resume_url TEXT DEFAULT NULL,
  p_current_company TEXT DEFAULT NULL,
  p_current_position TEXT DEFAULT NULL,
  p_current_salary INT DEFAULT NULL,
  p_expected_salary INT DEFAULT NULL,
  p_experience_years NUMERIC DEFAULT NULL,
  p_grade TEXT DEFAULT NULL,
  p_skills TEXT[] DEFAULT '{}',
  p_english_level TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_willing_to_relocate BOOLEAN DEFAULT false,
  p_work_format TEXT DEFAULT 'any',
  p_source TEXT DEFAULT 'direct',
  p_tags TEXT[] DEFAULT '{}',
  p_notes TEXT DEFAULT NULL
)
RETURNS crm.hr_candidates
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  INSERT INTO crm.hr_candidates(
    user_id, name, phone, email, telegram_handle, linkedin_url, resume_url,
    current_company, current_position, current_salary, expected_salary,
    experience_years, grade, skills, english_level,
    city, willing_to_relocate, work_format, source, tags, notes
  ) VALUES (
    auth.uid(), p_name, p_phone, p_email, p_telegram_handle, p_linkedin_url, p_resume_url,
    p_current_company, p_current_position, p_current_salary, p_expected_salary,
    p_experience_years, p_grade, p_skills, p_english_level,
    p_city, p_willing_to_relocate, p_work_format, p_source, p_tags, p_notes
  ) RETURNING *;
$$;

CREATE OR REPLACE FUNCTION crm.update_hr_candidate(
  p_id UUID,
  p_name TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_expected_salary INT DEFAULT NULL,
  p_grade TEXT DEFAULT NULL,
  p_skills TEXT[] DEFAULT NULL,
  p_source TEXT DEFAULT NULL,
  p_tags TEXT[] DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_blacklisted BOOLEAN DEFAULT NULL,
  p_blacklist_reason TEXT DEFAULT NULL,
  p_vip BOOLEAN DEFAULT NULL
)
RETURNS crm.hr_candidates
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  UPDATE crm.hr_candidates SET
    name              = COALESCE(p_name, name),
    phone             = COALESCE(p_phone, phone),
    email             = COALESCE(p_email, email),
    expected_salary   = COALESCE(p_expected_salary, expected_salary),
    grade             = COALESCE(p_grade, grade),
    skills            = COALESCE(p_skills, skills),
    source            = COALESCE(p_source, source),
    tags              = COALESCE(p_tags, tags),
    notes             = COALESCE(p_notes, notes),
    blacklisted       = COALESCE(p_blacklisted, blacklisted),
    blacklist_reason  = COALESCE(p_blacklist_reason, blacklist_reason),
    vip               = COALESCE(p_vip, vip),
    updated_at        = NOW()
  WHERE id = p_id AND user_id = auth.uid()
  RETURNING *;
$$;

-- ─── RPC: APPLICATIONS / PIPELINE ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.get_hr_applications(
  p_job_id UUID DEFAULT NULL,
  p_candidate_id UUID DEFAULT NULL,
  p_stage TEXT DEFAULT NULL
)
RETURNS SETOF crm.hr_applications
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  SELECT a.* FROM crm.hr_applications a
  WHERE a.user_id = auth.uid()
    AND (p_job_id IS NULL OR a.job_id = p_job_id)
    AND (p_candidate_id IS NULL OR a.candidate_id = p_candidate_id)
    AND (p_stage IS NULL OR a.stage = p_stage)
  ORDER BY a.applied_at DESC;
$$;

CREATE OR REPLACE FUNCTION crm.create_hr_application(
  p_job_id UUID,
  p_candidate_id UUID,
  p_stage TEXT DEFAULT 'new',
  p_cover_letter TEXT DEFAULT NULL,
  p_recruiter_notes TEXT DEFAULT NULL
)
RETURNS crm.hr_applications
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE
  v_app crm.hr_applications;
BEGIN
  INSERT INTO crm.hr_applications(user_id, job_id, candidate_id, stage, cover_letter, recruiter_notes)
  VALUES (auth.uid(), p_job_id, p_candidate_id, p_stage, p_cover_letter, p_recruiter_notes)
  RETURNING * INTO v_app;

  -- Log initial stage
  INSERT INTO crm.hr_stage_history(application_id, user_id, from_stage, to_stage)
  VALUES (v_app.id, auth.uid(), NULL, p_stage);

  RETURN v_app;
END;
$$;

CREATE OR REPLACE FUNCTION crm.move_hr_application_stage(
  p_id UUID,
  p_stage TEXT,
  p_notes TEXT DEFAULT NULL,
  p_reject_reason TEXT DEFAULT NULL,
  p_score INT DEFAULT NULL
)
RETURNS crm.hr_applications
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE
  v_old_stage TEXT;
  v_app crm.hr_applications;
BEGIN
  SELECT stage INTO v_old_stage FROM crm.hr_applications WHERE id = p_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;

  UPDATE crm.hr_applications SET
    stage            = p_stage,
    stage_entered_at = NOW(),
    reject_reason    = CASE WHEN p_stage = 'rejected' THEN COALESCE(p_reject_reason, reject_reason) ELSE reject_reason END,
    reject_stage     = CASE WHEN p_stage = 'rejected' THEN v_old_stage ELSE reject_stage END,
    score            = COALESCE(p_score, score),
    recruiter_notes  = CASE WHEN p_notes IS NOT NULL THEN p_notes ELSE recruiter_notes END,
    hired_at         = CASE WHEN p_stage = 'hired' THEN NOW() ELSE hired_at END,
    updated_at       = NOW()
  WHERE id = p_id AND user_id = auth.uid()
  RETURNING * INTO v_app;

  -- Write history
  INSERT INTO crm.hr_stage_history(application_id, user_id, from_stage, to_stage, notes)
  VALUES (p_id, auth.uid(), v_old_stage, p_stage, p_notes);

  RETURN v_app;
END;
$$;

-- ─── RPC: INTERVIEWS ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.get_hr_interviews(
  p_application_id UUID DEFAULT NULL,
  p_date_from TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF crm.hr_interviews
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  SELECT * FROM crm.hr_interviews
  WHERE user_id = auth.uid()
    AND (p_application_id IS NULL OR application_id = p_application_id)
    AND (p_date_from IS NULL OR scheduled_at >= p_date_from)
  ORDER BY scheduled_at DESC;
$$;

CREATE OR REPLACE FUNCTION crm.create_hr_interview(
  p_application_id UUID,
  p_candidate_id UUID,
  p_job_id UUID,
  p_interview_type TEXT DEFAULT 'hr_call',
  p_scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  p_duration_min INT DEFAULT 60,
  p_location TEXT DEFAULT NULL,
  p_meeting_link TEXT DEFAULT NULL,
  p_interviewers TEXT[] DEFAULT '{}'
)
RETURNS crm.hr_interviews
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  INSERT INTO crm.hr_interviews(
    user_id, application_id, candidate_id, job_id,
    interview_type, scheduled_at, duration_min, location, meeting_link, interviewers
  ) VALUES (
    auth.uid(), p_application_id, p_candidate_id, p_job_id,
    p_interview_type, p_scheduled_at, p_duration_min, p_location, p_meeting_link, p_interviewers
  ) RETURNING *;
$$;

CREATE OR REPLACE FUNCTION crm.complete_hr_interview(
  p_id UUID,
  p_scorecard JSONB DEFAULT '[]',
  p_overall_score INT DEFAULT NULL,
  p_recommendation TEXT DEFAULT NULL,
  p_feedback TEXT DEFAULT NULL
)
RETURNS crm.hr_interviews
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  UPDATE crm.hr_interviews SET
    scorecard      = p_scorecard,
    overall_score  = p_overall_score,
    recommendation = p_recommendation,
    feedback       = p_feedback,
    status         = 'completed',
    updated_at     = NOW()
  WHERE id = p_id AND user_id = auth.uid()
  RETURNING *;
$$;

-- ─── RPC: OFFERS ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.create_hr_offer(
  p_application_id UUID,
  p_candidate_id UUID,
  p_job_id UUID,
  p_offered_salary INT,
  p_start_date DATE DEFAULT NULL,
  p_probation_months INT DEFAULT 3,
  p_bonuses TEXT DEFAULT NULL,
  p_offer_text TEXT DEFAULT NULL,
  p_deadline DATE DEFAULT NULL
)
RETURNS crm.hr_offers
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  INSERT INTO crm.hr_offers(
    user_id, application_id, candidate_id, job_id,
    offered_salary, start_date, probation_months, bonuses, offer_text, deadline
  ) VALUES (
    auth.uid(), p_application_id, p_candidate_id, p_job_id,
    p_offered_salary, p_start_date, p_probation_months, p_bonuses, p_offer_text, p_deadline
  ) RETURNING *;
$$;

CREATE OR REPLACE FUNCTION crm.update_hr_offer_status(
  p_id UUID,
  p_status TEXT,
  p_decline_reason TEXT DEFAULT NULL
)
RETURNS crm.hr_offers
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  UPDATE crm.hr_offers SET
    status          = p_status,
    sent_at         = CASE WHEN p_status = 'sent' THEN NOW() ELSE sent_at END,
    accepted_at     = CASE WHEN p_status = 'accepted' THEN NOW() ELSE accepted_at END,
    declined_at     = CASE WHEN p_status = 'declined' THEN NOW() ELSE declined_at END,
    decline_reason  = COALESCE(p_decline_reason, decline_reason),
    updated_at      = NOW()
  WHERE id = p_id AND user_id = auth.uid()
  RETURNING *;
$$;

-- ─── RPC: HR ANALYTICS DASHBOARD ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.get_hr_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    -- Jobs
    'open_jobs',           (SELECT COUNT(*) FROM crm.hr_jobs WHERE user_id=auth.uid() AND status='open'),
    'total_jobs',          (SELECT COUNT(*) FROM crm.hr_jobs WHERE user_id=auth.uid()),
    'urgent_jobs',         (SELECT COUNT(*) FROM crm.hr_jobs WHERE user_id=auth.uid() AND status='open' AND priority='urgent'),

    -- Candidates & pipeline
    'total_candidates',    (SELECT COUNT(*) FROM crm.hr_candidates WHERE user_id=auth.uid() AND NOT blacklisted),
    'active_applications', (SELECT COUNT(*) FROM crm.hr_applications WHERE user_id=auth.uid() AND stage NOT IN ('hired','rejected','archived')),
    'hired_this_month',    (SELECT COUNT(*) FROM crm.hr_applications WHERE user_id=auth.uid() AND stage='hired' AND hired_at >= date_trunc('month',NOW())),
    'hired_total',         (SELECT COUNT(*) FROM crm.hr_applications WHERE user_id=auth.uid() AND stage='hired'),
    'rejected_total',      (SELECT COUNT(*) FROM crm.hr_applications WHERE user_id=auth.uid() AND stage='rejected'),

    -- Funnel by stage
    'funnel',              (
      SELECT jsonb_agg(jsonb_build_object('stage', stage, 'count', cnt))
      FROM (
        SELECT stage, COUNT(*) cnt FROM crm.hr_applications
        WHERE user_id=auth.uid() AND stage NOT IN ('archived')
        GROUP BY stage ORDER BY cnt DESC
      ) f
    ),

    -- Interviews today
    'interviews_today',    (SELECT COUNT(*) FROM crm.hr_interviews WHERE user_id=auth.uid() AND scheduled_at::date = NOW()::date AND status='scheduled'),
    'interviews_this_week',(SELECT COUNT(*) FROM crm.hr_interviews WHERE user_id=auth.uid() AND scheduled_at >= date_trunc('week',NOW()) AND status='scheduled'),

    -- Offers
    'offers_sent',         (SELECT COUNT(*) FROM crm.hr_offers WHERE user_id=auth.uid() AND status='sent'),
    'offers_accepted',     (SELECT COUNT(*) FROM crm.hr_offers WHERE user_id=auth.uid() AND status='accepted'),
    'offer_accept_rate',   (
      SELECT CASE WHEN total_o = 0 THEN 0 ELSE ROUND(acc_o::NUMERIC/total_o*100,1) END
      FROM (SELECT COUNT(*) FILTER (WHERE status='accepted') acc_o, COUNT(*) total_o FROM crm.hr_offers WHERE user_id=auth.uid()) x
    ),

    -- Sources
    'candidate_sources',   (
      SELECT jsonb_agg(jsonb_build_object('source', source, 'count', cnt))
      FROM (SELECT source, COUNT(*) cnt FROM crm.hr_candidates WHERE user_id=auth.uid() AND NOT blacklisted GROUP BY source ORDER BY cnt DESC) s
    ),

    -- Avg time-to-hire (days from application to hired)
    'avg_time_to_hire_days', (
      SELECT ROUND(AVG(EXTRACT(DAY FROM (hired_at - applied_at)))::NUMERIC, 1)
      FROM crm.hr_applications
      WHERE user_id=auth.uid() AND stage='hired' AND hired_at IS NOT NULL
    ),

    -- New candidates this week
    'new_candidates_week', (SELECT COUNT(*) FROM crm.hr_candidates WHERE user_id=auth.uid() AND created_at >= date_trunc('week',NOW()))
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- ─── UPDATED_AT TRIGGERS ─────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_hr_jobs_updated_at') THEN
    CREATE TRIGGER trg_hr_jobs_updated_at BEFORE UPDATE ON crm.hr_jobs
      FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_hr_cands_updated_at') THEN
    CREATE TRIGGER trg_hr_cands_updated_at BEFORE UPDATE ON crm.hr_candidates
      FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_hr_apps_updated_at') THEN
    CREATE TRIGGER trg_hr_apps_updated_at BEFORE UPDATE ON crm.hr_applications
      FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_hr_interviews_updated_at') THEN
    CREATE TRIGGER trg_hr_interviews_updated_at BEFORE UPDATE ON crm.hr_interviews
      FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_hr_offers_updated_at') THEN
    CREATE TRIGGER trg_hr_offers_updated_at BEFORE UPDATE ON crm.hr_offers
      FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at();
  END IF;
END $$;
