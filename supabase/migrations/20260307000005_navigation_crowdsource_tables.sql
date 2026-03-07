-- =============================================================================
-- ECOMANSONI Navigation Platform — Crowdsourcing таблицы
-- Миграция: 20260307000005_navigation_crowdsource_tables.sql
-- Зависимости: 20260307000002_navigation_core_tables.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. nav_reporter_reputation — репутация/гейм-прогресс контрибьюторов
--    Создаётся до nav_crowdsource_reports, чтобы работал FK ниже
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nav_reporter_reputation (
    user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    total_reports    INTEGER NOT NULL DEFAULT 0 CHECK (total_reports >= 0),
    verified_reports INTEGER NOT NULL DEFAULT 0 CHECK (verified_reports >= 0),
    rejected_reports INTEGER NOT NULL DEFAULT 0 CHECK (rejected_reports >= 0),
    trust_score      NUMERIC(5,4) NOT NULL DEFAULT 0.5 CHECK (trust_score BETWEEN 0 AND 1),
    xp               INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
    level            INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 100),
    badges           TEXT[] NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Инвариант: verified + rejected <= total
    CONSTRAINT nav_reporter_reputation_counts_valid CHECK (
        verified_reports + rejected_reports <= total_reports
    )
);

COMMENT ON TABLE  public.nav_reporter_reputation IS 'Геймификация: репутация, XP, уровни и бейджи контрибьюторов карты.';
COMMENT ON COLUMN public.nav_reporter_reputation.trust_score IS 'Доверие к репортам [0,1]. Влияет на вес голоса при верификации.';

CREATE INDEX IF NOT EXISTS idx_nav_reporter_reputation_trust
    ON public.nav_reporter_reputation(trust_score DESC);
CREATE INDEX IF NOT EXISTS idx_nav_reporter_reputation_level
    ON public.nav_reporter_reputation(level DESC);

ALTER TABLE public.nav_reporter_reputation ENABLE ROW LEVEL SECURITY;

-- Пользователь видит свою репутацию
CREATE POLICY "nav_reporter_reputation_select_own"
    ON public.nav_reporter_reputation FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- service_role видит и обновляет все записи
CREATE POLICY "nav_reporter_reputation_all_service_role"
    ON public.nav_reporter_reputation FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 2. nav_crowdsource_reports — пользовательские репорты о ситуации на дороге
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nav_crowdsource_reports (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    report_type      TEXT NOT NULL CHECK (report_type IN (
                         'accident','police','camera','road_work',
                         'hazard','closure','pothole'
                     )),
    status           TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN (
                         'submitted','verified','active','expired','rejected'
                     )),
    location         GEOMETRY(Point, 4326) NOT NULL,
    road_segment_id  UUID REFERENCES public.nav_road_segments(id) ON DELETE SET NULL,
    h3_cell          TEXT,
    description      TEXT,
    direction_deg    NUMERIC(5,1) CHECK (direction_deg >= 0 AND direction_deg < 360),
    upvotes          INTEGER NOT NULL DEFAULT 0 CHECK (upvotes >= 0),
    downvotes        INTEGER NOT NULL DEFAULT 0 CHECK (downvotes >= 0),
    confidence_score NUMERIC(3,2) NOT NULL DEFAULT 0.5 CHECK (confidence_score BETWEEN 0 AND 1),
    photos           TEXT[],
    expires_at       TIMESTAMPTZ,
    verified_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.nav_crowdsource_reports IS 'Crowdsource репорты: ДТП, камеры, дорожные работы и т.д.';
COMMENT ON COLUMN public.nav_crowdsource_reports.confidence_score IS 'P(репорт реален) = f(trust_score автора, upvotes, время)';

CREATE INDEX IF NOT EXISTS idx_nav_crowdsource_reports_location
    ON public.nav_crowdsource_reports USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_nav_crowdsource_reports_h3_cell
    ON public.nav_crowdsource_reports(h3_cell);
CREATE INDEX IF NOT EXISTS idx_nav_crowdsource_reports_type_status
    ON public.nav_crowdsource_reports(report_type, status);
CREATE INDEX IF NOT EXISTS idx_nav_crowdsource_reports_active
    ON public.nav_crowdsource_reports(status, expires_at)
    WHERE status IN ('verified','active');
CREATE INDEX IF NOT EXISTS idx_nav_crowdsource_reports_reporter
    ON public.nav_crowdsource_reports(reporter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_crowdsource_reports_road_segment
    ON public.nav_crowdsource_reports(road_segment_id) WHERE road_segment_id IS NOT NULL;

ALTER TABLE public.nav_crowdsource_reports ENABLE ROW LEVEL SECURITY;

-- Публичная выдача: только актуальные/публичные статусы
CREATE POLICY "nav_crowdsource_reports_select_public"
    ON public.nav_crowdsource_reports FOR SELECT
    TO authenticated
    USING (status IN ('verified','active','expired'));

-- Автор всегда видит свои репорты (включая submitted/rejected)
CREATE POLICY "nav_crowdsource_reports_select_own"
    ON public.nav_crowdsource_reports FOR SELECT
    TO authenticated
    USING (reporter_id = auth.uid());

-- Пользователь создаёт репорт от своего имени
CREATE POLICY "nav_crowdsource_reports_insert_own"
    ON public.nav_crowdsource_reports FOR INSERT
    TO authenticated
    WITH CHECK (reporter_id = auth.uid());

-- Пользователь может отозвать только свой репорт
CREATE POLICY "nav_crowdsource_reports_update_own"
    ON public.nav_crowdsource_reports FOR UPDATE
    TO authenticated
    USING (reporter_id = auth.uid())
    WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "nav_crowdsource_reports_all_service_role"
    ON public.nav_crowdsource_reports FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 3. nav_report_votes — голосование за репорты (up/down)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nav_report_votes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id   UUID NOT NULL REFERENCES public.nav_crowdsource_reports(id) ON DELETE CASCADE,
    voter_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    vote_type   TEXT NOT NULL CHECK (vote_type IN ('up','down')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Один голос на пользователя за репорт
    UNIQUE (report_id, voter_id)
);

COMMENT ON TABLE public.nav_report_votes IS 'Голосование за crowdsource репорты. Влияет на confidence_score.';

CREATE INDEX IF NOT EXISTS idx_nav_report_votes_report
    ON public.nav_report_votes(report_id, vote_type);
CREATE INDEX IF NOT EXISTS idx_nav_report_votes_voter
    ON public.nav_report_votes(voter_id, created_at DESC);

ALTER TABLE public.nav_report_votes ENABLE ROW LEVEL SECURITY;

-- Все авторизованные видят голосование
CREATE POLICY "nav_report_votes_select_authenticated"
    ON public.nav_report_votes FOR SELECT
    TO authenticated
    USING (true);

-- Пользователь голосует от своего имени (нельзя голосовать за свой репорт — проверяется в триггере)
CREATE POLICY "nav_report_votes_insert_own"
    ON public.nav_report_votes FOR INSERT
    TO authenticated
    WITH CHECK (voter_id = auth.uid());

-- Смена голоса
CREATE POLICY "nav_report_votes_update_own"
    ON public.nav_report_votes FOR UPDATE
    TO authenticated
    USING (voter_id = auth.uid())
    WITH CHECK (voter_id = auth.uid());

-- Удаление голоса
CREATE POLICY "nav_report_votes_delete_own"
    ON public.nav_report_votes FOR DELETE
    TO authenticated
    USING (voter_id = auth.uid());

CREATE POLICY "nav_report_votes_all_service_role"
    ON public.nav_report_votes FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 4. nav_map_edits — пользовательские правки карты (OSM-style editing)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nav_map_edits (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    editor_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    edit_type        TEXT NOT NULL CHECK (edit_type IN (
                         'road_add','road_modify','poi_add','poi_modify','address_fix'
                     )),
    status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
                         'draft','proposed','under_review','approved','rejected','merged'
                     )),
    geometry_before  GEOMETRY,
    geometry_after   GEOMETRY,
    tags_before      JSONB,
    tags_after       JSONB,
    reviewer_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    review_comment   TEXT,
    quality_score    NUMERIC(3,2) CHECK (quality_score BETWEEN 0 AND 1),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.nav_map_edits IS 'Правки карты от пользователей. Проходят review перед merge в nav_road_segments/nav_pois.';

CREATE INDEX IF NOT EXISTS idx_nav_map_edits_editor
    ON public.nav_map_edits(editor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_map_edits_status
    ON public.nav_map_edits(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_map_edits_review_pending
    ON public.nav_map_edits(created_at DESC)
    WHERE status IN ('proposed','under_review');
CREATE INDEX IF NOT EXISTS idx_nav_map_edits_geometry_after
    ON public.nav_map_edits USING GIST(geometry_after) WHERE geometry_after IS NOT NULL;

ALTER TABLE public.nav_map_edits ENABLE ROW LEVEL SECURITY;

-- Пользователь управляет своими правками (draft и proposed)
CREATE POLICY "nav_map_edits_select_own"
    ON public.nav_map_edits FOR SELECT
    TO authenticated
    USING (editor_id = auth.uid());

CREATE POLICY "nav_map_edits_insert_own"
    ON public.nav_map_edits FOR INSERT
    TO authenticated
    WITH CHECK (editor_id = auth.uid());

CREATE POLICY "nav_map_edits_update_own_draft"
    ON public.nav_map_edits FOR UPDATE
    TO authenticated
    USING (editor_id = auth.uid() AND status IN ('draft','proposed'))
    WITH CHECK (editor_id = auth.uid());

-- Reviewer (service_role или admin) может обновлять любую правку
CREATE POLICY "nav_map_edits_all_service_role"
    ON public.nav_map_edits FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
