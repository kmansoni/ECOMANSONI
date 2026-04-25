-- Feature flags таблица для управления фичами без деплоя

CREATE TABLE IF NOT EXISTS public.feature_flags (
  flag_key            TEXT PRIMARY KEY,
  enabled             BOOLEAN NOT NULL DEFAULT false,
  rollout_percent     INTEGER NOT NULL DEFAULT 100 CHECK (rollout_percent BETWEEN 0 AND 100),
  allowed_user_ids    UUID[],
  description         TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- Читать флаги могут все авторизованные
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='feature_flags' AND policyname='Authenticated users can read flags'
  ) THEN
    CREATE POLICY "Authenticated users can read flags"
      ON public.feature_flags FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- Менять флаги могут только admins (через service_role или RLS admin check)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='feature_flags' AND policyname='Admins can manage flags'
  ) THEN
    CREATE POLICY "Admins can manage flags"
      ON public.feature_flags FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
        )
      );
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_feature_flags_updated_at ON public.feature_flags;
CREATE TRIGGER update_feature_flags_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Начальные значения флагов
INSERT INTO public.feature_flags (flag_key, enabled, rollout_percent, description) VALUES
  ('reels_v2',          true,  100, 'Reels v2 с новым плеером'),
  ('calls_v2',          true,  100, 'Видеозвонки v2 с E2EE'),
  ('live_streaming',    true,  100, 'Live стриминг'),
  ('marketplace_v2',    false, 0,   'Маркетплейс v2 — в разработке'),
  ('ai_assistant',      true,  100, 'AI ассистент Aria'),
  ('navigation_hd',     false, 10,  'HD навигация — canary 10%'),
  ('insurance_kasko',   true,  100, 'КАСКО страхование'),
  ('crm_v2',            false, 0,   'CRM v2 — в разработке'),
  ('dark_mode_v2',      false, 20,  'Новая тёмная тема — canary 20%'),
  ('stories_reactions', true,  100, 'Реакции на Stories'),
  ('e2ee_sfu',          true,  100, 'E2EE для групповых звонков через SFU'),
  ('canary_rollout',    false, 5,   'Canary rollout для новых фич — 5%')
ON CONFLICT (flag_key) DO NOTHING;
