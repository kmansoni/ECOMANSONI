-- =============================================================================
-- ФИАС fields + POI ownership
-- Миграция: 20260330000001_fias_fields.sql
-- =============================================================================

-- nav_addresses: FIAS identifiers
ALTER TABLE public.nav_addresses
  ADD COLUMN IF NOT EXISTS fias_id    TEXT,
  ADD COLUMN IF NOT EXISTS kladr_id   TEXT,
  ADD COLUMN IF NOT EXISTS region     TEXT,
  ADD COLUMN IF NOT EXISTS fias_level INTEGER CHECK (fias_level BETWEEN 0 AND 9);

CREATE INDEX IF NOT EXISTS idx_nav_addresses_fias_id
  ON public.nav_addresses(fias_id) WHERE fias_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nav_addresses_kladr_id
  ON public.nav_addresses(kladr_id) WHERE kladr_id IS NOT NULL;

-- nav_saved_places: FIAS + postal code
ALTER TABLE public.nav_saved_places
  ADD COLUMN IF NOT EXISTS fias_id     TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS category    TEXT;

-- nav_pois: allow authenticated users to add POIs
ALTER TABLE public.nav_pois
  ADD COLUMN IF NOT EXISTS owner_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fias_address_id  TEXT,
  ADD COLUMN IF NOT EXISTS inn              TEXT,
  ADD COLUMN IF NOT EXISTS ogrn             TEXT;

CREATE INDEX IF NOT EXISTS idx_nav_pois_owner_id
  ON public.nav_pois(owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nav_pois_inn
  ON public.nav_pois(inn) WHERE inn IS NOT NULL;

-- Allow authenticated users to INSERT POIs (user-contributed places)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'nav_pois' AND policyname = 'nav_pois_insert_authenticated'
  ) THEN
    CREATE POLICY "nav_pois_insert_authenticated"
      ON public.nav_pois FOR INSERT
      TO authenticated
      WITH CHECK (owner_id = auth.uid());
  END IF;
END $$;

-- Allow users to UPDATE their own POIs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'nav_pois' AND policyname = 'nav_pois_update_own'
  ) THEN
    CREATE POLICY "nav_pois_update_own"
      ON public.nav_pois FOR UPDATE
      TO authenticated
      USING (owner_id = auth.uid())
      WITH CHECK (owner_id = auth.uid());
  END IF;
END $$;

-- Allow users to DELETE their own POIs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'nav_pois' AND policyname = 'nav_pois_delete_own'
  ) THEN
    CREATE POLICY "nav_pois_delete_own"
      ON public.nav_pois FOR DELETE
      TO authenticated
      USING (owner_id = auth.uid());
  END IF;
END $$;
