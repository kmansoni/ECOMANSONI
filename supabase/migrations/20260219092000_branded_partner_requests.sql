-- Branded content partner approval requests

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'branded_request_status') THEN
    CREATE TYPE public.branded_request_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.branded_content_partner_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT,
  status public.branded_request_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ
);

ALTER TABLE public.branded_content_partner_requests ENABLE ROW LEVEL SECURITY;

-- Brand can manage own outgoing requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'branded_content_partner_requests'
      AND policyname = 'Brand can view own requests'
  ) THEN
    CREATE POLICY "Brand can view own requests"
      ON public.branded_content_partner_requests
      FOR SELECT
      USING (auth.uid() = brand_user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'branded_content_partner_requests'
      AND policyname = 'Brand can create requests'
  ) THEN
    CREATE POLICY "Brand can create requests"
      ON public.branded_content_partner_requests
      FOR INSERT
      WITH CHECK (auth.uid() = brand_user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'branded_content_partner_requests'
      AND policyname = 'Brand can cancel own pending requests'
  ) THEN
    CREATE POLICY "Brand can cancel own pending requests"
      ON public.branded_content_partner_requests
      FOR UPDATE
      USING (auth.uid() = brand_user_id)
      WITH CHECK (auth.uid() = brand_user_id);
  END IF;
END $$;

-- Partner can see incoming requests and approve/reject
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'branded_content_partner_requests'
      AND policyname = 'Partner can view incoming requests'
  ) THEN
    CREATE POLICY "Partner can view incoming requests"
      ON public.branded_content_partner_requests
      FOR SELECT
      USING (auth.uid() = partner_user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'branded_content_partner_requests'
      AND policyname = 'Partner can decide requests'
  ) THEN
    CREATE POLICY "Partner can decide requests"
      ON public.branded_content_partner_requests
      FOR UPDATE
      USING (auth.uid() = partner_user_id)
      WITH CHECK (auth.uid() = partner_user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_branded_partner_requests_brand
  ON public.branded_content_partner_requests(brand_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_branded_partner_requests_partner
  ON public.branded_content_partner_requests(partner_user_id, created_at DESC);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.branded_content_partner_requests;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
