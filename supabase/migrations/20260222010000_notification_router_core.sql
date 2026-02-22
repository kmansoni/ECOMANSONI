-- Notification routing core tables + claim RPC for queue workers.

CREATE TABLE IF NOT EXISTS public.device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  provider TEXT NOT NULL CHECK (provider IN ('apns', 'fcm')),
  token TEXT NOT NULL,
  app_build INTEGER,
  app_version TEXT,
  locale TEXT,
  timezone TEXT,
  last_seen_at TIMESTAMPTZ,
  is_valid BOOLEAN NOT NULL DEFAULT TRUE,
  push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  call_push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS device_tokens_provider_token_uniq
  ON public.device_tokens(provider, token);

CREATE UNIQUE INDEX IF NOT EXISTS device_tokens_user_device_uniq
  ON public.device_tokens(user_id, device_id);

CREATE INDEX IF NOT EXISTS device_tokens_user_valid_idx
  ON public.device_tokens(user_id, is_valid, push_enabled);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "device_tokens_select_own" ON public.device_tokens;
CREATE POLICY "device_tokens_select_own"
  ON public.device_tokens
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "device_tokens_insert_own" ON public.device_tokens;
CREATE POLICY "device_tokens_insert_own"
  ON public.device_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "device_tokens_update_own" ON public.device_tokens;
CREATE POLICY "device_tokens_update_own"
  ON public.device_tokens
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "device_tokens_service_role_all" ON public.device_tokens;
CREATE POLICY "device_tokens_service_role_all"
  ON public.device_tokens
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE TABLE IF NOT EXISTS public.notification_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('message', 'incoming_call', 'security')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed')),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  priority INTEGER NOT NULL DEFAULT 5 CHECK (priority BETWEEN 0 AND 9),
  collapse_key TEXT,
  dedup_key TEXT,
  ttl_seconds INTEGER NOT NULL DEFAULT 60 CHECK (ttl_seconds BETWEEN 1 AND 86400),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notification_events_claim_idx
  ON public.notification_events(status, available_at, priority DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS notification_events_user_created_idx
  ON public.notification_events(user_id, created_at DESC);

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_events_service_role_all" ON public.notification_events;
CREATE POLICY "notification_events_service_role_all"
  ON public.notification_events
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  delivery_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.notification_events(event_id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('apns', 'fcm')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'failed', 'invalid_token', 'dropped')),
  attempts INTEGER NOT NULL DEFAULT 1,
  provider_message_id TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notification_deliveries_event_idx
  ON public.notification_deliveries(event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notification_deliveries_device_idx
  ON public.notification_deliveries(device_id, created_at DESC);

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_deliveries_service_role_all" ON public.notification_deliveries;
CREATE POLICY "notification_deliveries_service_role_all"
  ON public.notification_deliveries
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE OR REPLACE FUNCTION public.claim_notification_events(p_limit INTEGER DEFAULT 100)
RETURNS SETOF public.notification_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'claim_notification_events requires service_role';
  END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT ne.event_id
    FROM public.notification_events ne
    WHERE ne.status = 'pending'
      AND ne.available_at <= NOW()
    ORDER BY ne.priority DESC, ne.created_at ASC
    LIMIT GREATEST(1, LEAST(p_limit, 500))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.notification_events ne
  SET status = 'processing',
      attempts = ne.attempts + 1,
      updated_at = NOW()
  FROM picked
  WHERE ne.event_id = picked.event_id
  RETURNING ne.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_events(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_events(INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_device_token(
  p_device_id TEXT,
  p_platform TEXT,
  p_provider TEXT,
  p_token TEXT,
  p_app_build INTEGER DEFAULT NULL,
  p_app_version TEXT DEFAULT NULL,
  p_locale TEXT DEFAULT NULL,
  p_timezone TEXT DEFAULT NULL
)
RETURNS public.device_tokens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_row public.device_tokens;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'upsert_device_token requires authenticated user';
  END IF;

  INSERT INTO public.device_tokens (
    user_id, device_id, platform, provider, token, app_build, app_version, locale, timezone, last_seen_at, is_valid, updated_at
  )
  VALUES (
    v_user_id, p_device_id, p_platform, p_provider, p_token, p_app_build, p_app_version, p_locale, p_timezone, NOW(), TRUE, NOW()
  )
  ON CONFLICT (user_id, device_id)
  DO UPDATE SET
    platform = EXCLUDED.platform,
    provider = EXCLUDED.provider,
    token = EXCLUDED.token,
    app_build = EXCLUDED.app_build,
    app_version = EXCLUDED.app_version,
    locale = EXCLUDED.locale,
    timezone = EXCLUDED.timezone,
    last_seen_at = NOW(),
    is_valid = TRUE,
    updated_at = NOW()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_device_token(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_device_token(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enqueue_notification_event(
  p_type TEXT,
  p_user_id UUID,
  p_payload JSONB,
  p_priority INTEGER DEFAULT 5,
  p_ttl_seconds INTEGER DEFAULT 60,
  p_collapse_key TEXT DEFAULT NULL,
  p_dedup_key TEXT DEFAULT NULL,
  p_max_attempts INTEGER DEFAULT 5
)
RETURNS public.notification_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.notification_events;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'enqueue_notification_event requires service_role';
  END IF;

  INSERT INTO public.notification_events (
    type, status, user_id, payload, priority, ttl_seconds, collapse_key, dedup_key, max_attempts
  )
  VALUES (
    p_type, 'pending', p_user_id, p_payload, p_priority, p_ttl_seconds, p_collapse_key, p_dedup_key, p_max_attempts
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_notification_event(TEXT, UUID, JSONB, INTEGER, INTEGER, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_notification_event(TEXT, UUID, JSONB, INTEGER, INTEGER, TEXT, TEXT, INTEGER) TO service_role;
