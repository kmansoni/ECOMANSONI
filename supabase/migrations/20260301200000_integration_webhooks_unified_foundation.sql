-- Stage 2 / Item #42 foundation: Unified incoming/outgoing webhooks platform

CREATE TABLE IF NOT EXISTS public.integration_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  provider text NOT NULL DEFAULT 'generic',
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  secret text,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  last_status text,
  last_error text,
  last_invoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integration_webhooks_user_active
  ON public.integration_webhooks(user_id, is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_webhooks_direction
  ON public.integration_webhooks(direction, is_active, created_at DESC);
ALTER TABLE public.integration_webhooks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "integration_webhooks_select_own" ON public.integration_webhooks;
CREATE POLICY "integration_webhooks_select_own"
ON public.integration_webhooks
FOR SELECT
USING (user_id = auth.uid());
DROP POLICY IF EXISTS "integration_webhooks_insert_own" ON public.integration_webhooks;
CREATE POLICY "integration_webhooks_insert_own"
ON public.integration_webhooks
FOR INSERT
WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "integration_webhooks_update_own" ON public.integration_webhooks;
CREATE POLICY "integration_webhooks_update_own"
ON public.integration_webhooks
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "integration_webhooks_delete_own" ON public.integration_webhooks;
CREATE POLICY "integration_webhooks_delete_own"
ON public.integration_webhooks
FOR DELETE
USING (user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.integration_webhooks_set_updated_at_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_integration_webhooks_set_updated_at ON public.integration_webhooks;
CREATE TRIGGER trg_integration_webhooks_set_updated_at
BEFORE UPDATE ON public.integration_webhooks
FOR EACH ROW
EXECUTE FUNCTION public.integration_webhooks_set_updated_at_v1();
CREATE OR REPLACE FUNCTION public.integration_webhook_create_v1(
  _direction text,
  _provider text,
  _url text,
  _events text[] DEFAULT '{}'::text[],
  _secret text DEFAULT NULL,
  _headers jsonb DEFAULT '{}'::jsonb,
  _is_active boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _id uuid;
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF _direction IS NULL OR _direction NOT IN ('incoming', 'outgoing') THEN
    RAISE EXCEPTION 'invalid_direction' USING ERRCODE = '22023';
  END IF;

  IF _url IS NULL OR btrim(_url) = '' OR position('http' in lower(btrim(_url))) <> 1 THEN
    RAISE EXCEPTION 'invalid_url' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.integration_webhooks (
    user_id,
    direction,
    provider,
    url,
    events,
    secret,
    headers,
    is_active
  )
  VALUES (
    _actor_id,
    _direction,
    COALESCE(NULLIF(btrim(COALESCE(_provider, '')), ''), 'generic'),
    btrim(_url),
    COALESCE(_events, '{}'::text[]),
    NULLIF(btrim(COALESCE(_secret, '')), ''),
    COALESCE(_headers, '{}'::jsonb),
    COALESCE(_is_active, true)
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;
CREATE OR REPLACE FUNCTION public.integration_webhook_update_v1(
  _id uuid,
  _url text DEFAULT NULL,
  _events text[] DEFAULT NULL,
  _secret text DEFAULT NULL,
  _headers jsonb DEFAULT NULL,
  _is_active boolean DEFAULT NULL,
  _last_status text DEFAULT NULL,
  _last_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _actor_id uuid := auth.uid();
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF _id IS NULL THEN
    RAISE EXCEPTION 'invalid_id' USING ERRCODE = '22023';
  END IF;

  UPDATE public.integration_webhooks iw
  SET url = COALESCE(NULLIF(btrim(COALESCE(_url, '')), ''), iw.url),
      events = COALESCE(_events, iw.events),
      secret = COALESCE(NULLIF(btrim(COALESCE(_secret, '')), ''), iw.secret),
      headers = COALESCE(_headers, iw.headers),
      is_active = COALESCE(_is_active, iw.is_active),
      last_status = COALESCE(_last_status, iw.last_status),
      last_error = COALESCE(_last_error, iw.last_error),
      last_invoked_at = CASE
        WHEN _last_status IS NOT NULL OR _last_error IS NOT NULL THEN now()
        ELSE iw.last_invoked_at
      END,
      updated_at = now()
  WHERE iw.id = _id
    AND iw.user_id = _actor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'integration_webhook_not_found' USING ERRCODE = '22023';
  END IF;

  RETURN true;
END;
$$;
CREATE OR REPLACE FUNCTION public.integration_webhook_delete_v1(
  _id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _actor_id uuid := auth.uid();
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF _id IS NULL THEN
    RAISE EXCEPTION 'invalid_id' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.integration_webhooks iw
  WHERE iw.id = _id
    AND iw.user_id = _actor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'integration_webhook_not_found' USING ERRCODE = '22023';
  END IF;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.integration_webhook_create_v1(text, text, text, text[], text, jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.integration_webhook_update_v1(uuid, text, text[], text, jsonb, boolean, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.integration_webhook_delete_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integration_webhook_create_v1(text, text, text, text[], text, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.integration_webhook_update_v1(uuid, text, text[], text, jsonb, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.integration_webhook_delete_v1(uuid) TO authenticated;
