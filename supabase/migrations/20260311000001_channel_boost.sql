-- ALLOW_NON_IDEMPOTENT_POLICY_DDL: legacy migration already applied to production; non-idempotent policies are intentional here.
-- Channel Boost: Stars → channel perks
-- Migration: 20260311000001_channel_boost

CREATE TABLE public.channel_boosts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stars_spent INT NOT NULL CHECK (stars_spent > 0),
  boost_level INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(channel_id, user_id)
);

CREATE TABLE public.channel_boost_levels (
  channel_id UUID PRIMARY KEY REFERENCES public.channels(id) ON DELETE CASCADE,
  total_boosts INT NOT NULL DEFAULT 0,
  current_level INT NOT NULL DEFAULT 0,
  perks JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_channel_boosts_channel_id ON public.channel_boosts(channel_id);
CREATE INDEX idx_channel_boosts_user_id ON public.channel_boosts(user_id);
CREATE INDEX idx_channel_boosts_expires_at ON public.channel_boosts(expires_at);

-- RLS
ALTER TABLE public.channel_boosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_boost_levels ENABLE ROW LEVEL SECURITY;

-- channel_boosts: SELECT for authenticated
CREATE POLICY "channel_boosts_select_authenticated"
  ON public.channel_boosts FOR SELECT
  TO authenticated
  USING (true);

-- channel_boosts: INSERT only for own user_id
CREATE POLICY "channel_boosts_insert_own"
  ON public.channel_boosts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- channel_boosts: UPDATE only for own user_id
CREATE POLICY "channel_boosts_update_own"
  ON public.channel_boosts FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- channel_boosts: DELETE only for own user_id
CREATE POLICY "channel_boosts_delete_own"
  ON public.channel_boosts FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- channel_boost_levels: SELECT for authenticated
CREATE POLICY "channel_boost_levels_select_authenticated"
  ON public.channel_boost_levels FOR SELECT
  TO authenticated
  USING (true);

-- channel_boost_levels: mutations for service_role only
CREATE POLICY "channel_boost_levels_insert_service"
  ON public.channel_boost_levels FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "channel_boost_levels_update_service"
  ON public.channel_boost_levels FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "channel_boost_levels_delete_service"
  ON public.channel_boost_levels FOR DELETE
  TO service_role
  USING (true);
