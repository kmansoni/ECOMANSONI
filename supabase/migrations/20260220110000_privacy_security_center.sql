-- Telegram-like privacy/security center:
-- rules, exceptions, authorized websites, security settings.

-- =====================================================
-- 1) Extend user_settings
-- =====================================================

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS messages_auto_delete_seconds INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS account_self_destruct_days INTEGER NOT NULL DEFAULT 180;

-- =====================================================
-- 2) Privacy rules (one row per rule key)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.privacy_rules (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'everyone',
  phone_discovery_audience TEXT NOT NULL DEFAULT 'everyone',
  p2p_mode TEXT NOT NULL DEFAULT 'always',
  hide_read_time BOOLEAN NOT NULL DEFAULT false,
  gift_badge_enabled BOOLEAN NOT NULL DEFAULT false,
  gift_allow_common BOOLEAN NOT NULL DEFAULT true,
  gift_allow_rare BOOLEAN NOT NULL DEFAULT true,
  gift_allow_unique BOOLEAN NOT NULL DEFAULT true,
  gift_allow_channels BOOLEAN NOT NULL DEFAULT true,
  gift_allow_premium BOOLEAN NOT NULL DEFAULT true,
  ios_call_integration BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, rule_key),
  CONSTRAINT privacy_rules_rule_key_check CHECK (
    rule_key IN (
      'phone_number',
      'last_seen',
      'profile_photos',
      'bio',
      'gifts',
      'birthday',
      'saved_music',
      'forwarded_messages',
      'calls',
      'voice_messages',
      'messages',
      'invites'
    )
  ),
  CONSTRAINT privacy_rules_audience_check CHECK (
    audience IN ('everyone', 'contacts', 'nobody', 'contacts_and_premium', 'paid_messages')
  ),
  CONSTRAINT privacy_rules_phone_discovery_check CHECK (
    phone_discovery_audience IN ('everyone', 'contacts')
  ),
  CONSTRAINT privacy_rules_p2p_mode_check CHECK (
    p2p_mode IN ('always', 'contacts', 'never')
  )
);

ALTER TABLE public.privacy_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='privacy_rules'
      AND policyname='Users can view own privacy rules'
  ) THEN
    CREATE POLICY "Users can view own privacy rules"
      ON public.privacy_rules FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='privacy_rules'
      AND policyname='Users can upsert own privacy rules'
  ) THEN
    CREATE POLICY "Users can upsert own privacy rules"
      ON public.privacy_rules FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='privacy_rules'
      AND policyname='Users can update own privacy rules'
  ) THEN
    CREATE POLICY "Users can update own privacy rules"
      ON public.privacy_rules FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='privacy_rules'
      AND policyname='Users can delete own privacy rules'
  ) THEN
    CREATE POLICY "Users can delete own privacy rules"
      ON public.privacy_rules FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_privacy_rules_updated_at ON public.privacy_rules;
CREATE TRIGGER update_privacy_rules_updated_at
BEFORE UPDATE ON public.privacy_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS privacy_rules_user_updated_idx
  ON public.privacy_rules(user_id, updated_at DESC);

-- =====================================================
-- 3) Privacy rule exceptions
-- =====================================================

CREATE TABLE IF NOT EXISTS public.privacy_rule_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  mode TEXT NOT NULL,
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, rule_key, mode, target_user_id),
  CONSTRAINT privacy_rule_exceptions_rule_key_check CHECK (
    rule_key IN (
      'phone_number',
      'last_seen',
      'profile_photos',
      'bio',
      'gifts',
      'birthday',
      'saved_music',
      'forwarded_messages',
      'calls',
      'voice_messages',
      'messages',
      'invites'
    )
  ),
  CONSTRAINT privacy_rule_exceptions_mode_check CHECK (
    mode IN ('always_allow', 'never_allow')
  )
);

ALTER TABLE public.privacy_rule_exceptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='privacy_rule_exceptions'
      AND policyname='Users can view own privacy exceptions'
  ) THEN
    CREATE POLICY "Users can view own privacy exceptions"
      ON public.privacy_rule_exceptions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='privacy_rule_exceptions'
      AND policyname='Users can insert own privacy exceptions'
  ) THEN
    CREATE POLICY "Users can insert own privacy exceptions"
      ON public.privacy_rule_exceptions FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='privacy_rule_exceptions'
      AND policyname='Users can delete own privacy exceptions'
  ) THEN
    CREATE POLICY "Users can delete own privacy exceptions"
      ON public.privacy_rule_exceptions FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS privacy_rule_exceptions_user_rule_idx
  ON public.privacy_rule_exceptions(user_id, rule_key, mode);

-- =====================================================
-- 4) Authorized websites
-- =====================================================

CREATE TABLE IF NOT EXISTS public.authorized_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  site_name TEXT NOT NULL,
  domain TEXT NOT NULL,
  browser TEXT,
  os TEXT,
  location_label TEXT,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

ALTER TABLE public.authorized_sites ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='authorized_sites'
      AND policyname='Users can view own authorized sites'
  ) THEN
    CREATE POLICY "Users can view own authorized sites"
      ON public.authorized_sites FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='authorized_sites'
      AND policyname='Users can insert own authorized sites'
  ) THEN
    CREATE POLICY "Users can insert own authorized sites"
      ON public.authorized_sites FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='authorized_sites'
      AND policyname='Users can update own authorized sites'
  ) THEN
    CREATE POLICY "Users can update own authorized sites"
      ON public.authorized_sites FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS authorized_sites_user_active_idx
  ON public.authorized_sites(user_id, revoked_at, last_active_at DESC);

-- =====================================================
-- 5) Security settings (local passcode / cloud password / passkey flag)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_security_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  app_passcode_hash TEXT,
  cloud_password_hash TEXT,
  passkey_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_security_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_security_settings'
      AND policyname='Users can view own security settings'
  ) THEN
    CREATE POLICY "Users can view own security settings"
      ON public.user_security_settings FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_security_settings'
      AND policyname='Users can insert own security settings'
  ) THEN
    CREATE POLICY "Users can insert own security settings"
      ON public.user_security_settings FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_security_settings'
      AND policyname='Users can update own security settings'
  ) THEN
    CREATE POLICY "Users can update own security settings"
      ON public.user_security_settings FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_user_security_settings_updated_at ON public.user_security_settings;
CREATE TRIGGER update_user_security_settings_updated_at
BEFORE UPDATE ON public.user_security_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 6) Realtime
-- =====================================================

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.privacy_rules;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.privacy_rule_exceptions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.authorized_sites;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_security_settings;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

