-- =============================================================================
-- Autonomous Voice Learning Platform Foundation
-- Multilingual voice ingestion, address parsing feedback, hotspot learning,
-- and model status persistence for navigation and search intelligence.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.nav_voice_utterances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    user_id_hash TEXT,
    audio_storage_path TEXT,
    transcript_draft TEXT NOT NULL,
    transcript_final TEXT,
    language_code TEXT,
    accent_tag TEXT,
    source TEXT NOT NULL CHECK (source IN ('voice', 'search_text', 'synthetic', 'correction')),
    novelty_score NUMERIC(4,3) NOT NULL DEFAULT 0,
    parsed_address JSONB NOT NULL DEFAULT '{}'::jsonb,
    validation_status TEXT NOT NULL DEFAULT 'pending_review'
        CHECK (validation_status IN ('confirmed', 'provisional', 'pending_review', 'rejected')),
    validation_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.nav_voice_utterances IS 'Raw and normalized voice/search utterances used for multilingual ASR, address parsing, and self-learning.';

CREATE INDEX IF NOT EXISTS idx_nav_voice_utterances_user_created
    ON public.nav_voice_utterances(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_voice_utterances_source_created
    ON public.nav_voice_utterances(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_voice_utterances_validation_status
    ON public.nav_voice_utterances(validation_status, created_at DESC);


CREATE TABLE IF NOT EXISTS public.nav_voice_training_samples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utterance_id UUID REFERENCES public.nav_voice_utterances(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    transcript_final TEXT NOT NULL,
    address_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    novelty_score NUMERIC(4,3) NOT NULL DEFAULT 0,
    confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
    is_valid BOOLEAN NOT NULL DEFAULT false,
    validation_source TEXT NOT NULL DEFAULT 'rule_geocoder_ensemble',
    sample_source TEXT NOT NULL DEFAULT 'voice'
        CHECK (sample_source IN ('voice', 'search_text', 'synthetic', 'user_correction', 'voice_hotspot')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.nav_voice_training_samples IS 'Curated training set promoted from raw voice/search data after validation or user correction.';

CREATE INDEX IF NOT EXISTS idx_nav_voice_training_samples_user_created
    ON public.nav_voice_training_samples(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_voice_training_samples_valid_conf
    ON public.nav_voice_training_samples(is_valid, confidence DESC, created_at DESC);


CREATE TABLE IF NOT EXISTS public.nav_voice_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    utterance_id UUID REFERENCES public.nav_voice_utterances(id) ON DELETE CASCADE,
    sample_id UUID REFERENCES public.nav_voice_training_samples(id) ON DELETE SET NULL,
    corrected_transcript TEXT,
    corrected_address JSONB NOT NULL DEFAULT '{}'::jsonb,
    feedback_type TEXT NOT NULL
        CHECK (feedback_type IN ('explicit_correction', 'implicit_accept', 'reject', 'hotspot_confirm', 'hotspot_reject')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.nav_voice_feedback IS 'User supervision loop for ASR, address parsing, and hotspot confirmation.';

CREATE INDEX IF NOT EXISTS idx_nav_voice_feedback_user_created
    ON public.nav_voice_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_voice_feedback_utterance
    ON public.nav_voice_feedback(utterance_id, created_at DESC)
    WHERE utterance_id IS NOT NULL;


CREATE TABLE IF NOT EXISTS public.nav_address_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code TEXT,
    city TEXT,
    street TEXT NOT NULL,
    house_number TEXT,
    corpus TEXT,
    building TEXT,
    structure TEXT,
    pattern_type TEXT NOT NULL DEFAULT 'house_number',
    frequency INTEGER NOT NULL DEFAULT 1 CHECK (frequency >= 1),
    first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_confirmed BOOLEAN NOT NULL DEFAULT false,
    confirmation_source TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT nav_address_patterns_unique UNIQUE (country_code, city, street, house_number, corpus, building, structure)
);

COMMENT ON TABLE public.nav_address_patterns IS 'Canonical and provisional address-pattern memory, including rare house-corpus structures and new-building variants.';

CREATE INDEX IF NOT EXISTS idx_nav_address_patterns_city_street
    ON public.nav_address_patterns(city, street, last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_nav_address_patterns_confirmed_freq
    ON public.nav_address_patterns(is_confirmed, frequency DESC, last_seen DESC);


CREATE TABLE IF NOT EXISTS public.nav_address_hotspots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utterance_id UUID REFERENCES public.nav_voice_utterances(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    transcript TEXT NOT NULL,
    parsed_address JSONB NOT NULL,
    novelty_score NUMERIC(4,3) NOT NULL,
    reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
    text_variants JSONB NOT NULL DEFAULT '[]'::jsonb,
    synthetic_jobs JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'synthesized', 'validated', 'deployed', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.nav_address_hotspots IS 'Rare-address and novelty-learning queue for targeted synthetic augmentation and rapid fine-tuning.';

CREATE INDEX IF NOT EXISTS idx_nav_address_hotspots_status_created
    ON public.nav_address_hotspots(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_address_hotspots_novelty
    ON public.nav_address_hotspots(novelty_score DESC, created_at DESC);


CREATE TABLE IF NOT EXISTS public.nav_voice_model_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_type TEXT NOT NULL CHECK (model_type IN ('acoustic', 'language', 'ner', 'accent', 'voice_platform')),
    version_tag TEXT NOT NULL,
    deployment_state TEXT NOT NULL DEFAULT 'candidate'
        CHECK (deployment_state IN ('candidate', 'canary', 'active', 'rolled_back', 'archived')),
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    training_data_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deployed_at TIMESTAMPTZ
);

COMMENT ON TABLE public.nav_voice_model_versions IS 'Registry of ASR, address NER, accent, and voice-learning platform versions with rollout metadata.';

CREATE INDEX IF NOT EXISTS idx_nav_voice_model_versions_type_created
    ON public.nav_voice_model_versions(model_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_voice_model_versions_state
    ON public.nav_voice_model_versions(deployment_state, created_at DESC);


ALTER TABLE public.nav_voice_utterances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nav_voice_training_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nav_voice_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nav_address_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nav_address_hotspots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nav_voice_model_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nav_voice_utterances_select_own" ON public.nav_voice_utterances;
CREATE POLICY "nav_voice_utterances_select_own"
    ON public.nav_voice_utterances FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "nav_voice_utterances_insert_own" ON public.nav_voice_utterances;
CREATE POLICY "nav_voice_utterances_insert_own"
    ON public.nav_voice_utterances FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "nav_voice_utterances_service_all" ON public.nav_voice_utterances;
CREATE POLICY "nav_voice_utterances_service_all"
    ON public.nav_voice_utterances FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


DROP POLICY IF EXISTS "nav_voice_training_samples_select_own" ON public.nav_voice_training_samples;
CREATE POLICY "nav_voice_training_samples_select_own"
    ON public.nav_voice_training_samples FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "nav_voice_training_samples_insert_own" ON public.nav_voice_training_samples;
CREATE POLICY "nav_voice_training_samples_insert_own"
    ON public.nav_voice_training_samples FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "nav_voice_training_samples_service_all" ON public.nav_voice_training_samples;
CREATE POLICY "nav_voice_training_samples_service_all"
    ON public.nav_voice_training_samples FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


DROP POLICY IF EXISTS "nav_voice_feedback_select_own" ON public.nav_voice_feedback;
CREATE POLICY "nav_voice_feedback_select_own"
    ON public.nav_voice_feedback FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "nav_voice_feedback_insert_own" ON public.nav_voice_feedback;
CREATE POLICY "nav_voice_feedback_insert_own"
    ON public.nav_voice_feedback FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "nav_voice_feedback_service_all" ON public.nav_voice_feedback;
CREATE POLICY "nav_voice_feedback_service_all"
    ON public.nav_voice_feedback FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


DROP POLICY IF EXISTS "nav_address_patterns_read_authenticated" ON public.nav_address_patterns;
CREATE POLICY "nav_address_patterns_read_authenticated"
    ON public.nav_address_patterns FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "nav_address_patterns_service_all" ON public.nav_address_patterns;
CREATE POLICY "nav_address_patterns_service_all"
    ON public.nav_address_patterns FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


DROP POLICY IF EXISTS "nav_address_hotspots_select_own_or_service" ON public.nav_address_hotspots;
CREATE POLICY "nav_address_hotspots_select_own_or_service"
    ON public.nav_address_hotspots FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "nav_address_hotspots_insert_own" ON public.nav_address_hotspots;
CREATE POLICY "nav_address_hotspots_insert_own"
    ON public.nav_address_hotspots FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "nav_address_hotspots_service_all" ON public.nav_address_hotspots;
CREATE POLICY "nav_address_hotspots_service_all"
    ON public.nav_address_hotspots FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


DROP POLICY IF EXISTS "nav_voice_model_versions_read_authenticated" ON public.nav_voice_model_versions;
CREATE POLICY "nav_voice_model_versions_read_authenticated"
    ON public.nav_voice_model_versions FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "nav_voice_model_versions_service_all" ON public.nav_voice_model_versions;
CREATE POLICY "nav_voice_model_versions_service_all"
    ON public.nav_voice_model_versions FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


INSERT INTO public.nav_voice_model_versions (model_type, version_tag, deployment_state, metrics, training_data_hash)
SELECT
    'voice_platform',
    'foundation-v1',
    'candidate',
    jsonb_build_object(
        'wer_target', 0.10,
        'address_f1_target', 0.95,
        'hotspot_response_hours', 48,
        'novelty_recall_target', 0.80
    ),
    'foundation-bootstrap'
WHERE NOT EXISTS (
    SELECT 1
    FROM public.nav_voice_model_versions
    WHERE model_type = 'voice_platform'
      AND version_tag = 'foundation-v1'
);