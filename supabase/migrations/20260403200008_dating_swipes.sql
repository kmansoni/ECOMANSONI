-- Свайп-знакомства: профили, свайпы, мэтчи
-- Additive migration: создаёт таблицы dating_profiles, dating_swipes, dating_matches + auto-match trigger

CREATE TABLE IF NOT EXISTS dating_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  bio TEXT,
  photos JSONB DEFAULT '[]'::jsonb,
  age INTEGER CHECK (age BETWEEN 18 AND 120),
  gender TEXT CHECK (gender IN ('male', 'female', 'non-binary', 'other')),
  looking_for TEXT[] DEFAULT '{}',
  interests TEXT[] DEFAULT '{}',
  max_distance_km INTEGER DEFAULT 50,
  min_age INTEGER DEFAULT 18,
  max_age INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  last_active TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dating_swipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swiper_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  swiped_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('like', 'dislike', 'superlike')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(swiper_id, swiped_id)
);

CREATE TABLE IF NOT EXISTS dating_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  matched_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  UNIQUE(user1_id, user2_id)
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_dating_profiles_active ON dating_profiles(is_active, last_active DESC);
CREATE INDEX IF NOT EXISTS idx_dating_swipes_swiper ON dating_swipes(swiper_id);
CREATE INDEX IF NOT EXISTS idx_dating_swipes_swiped ON dating_swipes(swiped_id);
CREATE INDEX IF NOT EXISTS idx_dating_matches_user1 ON dating_matches(user1_id);
CREATE INDEX IF NOT EXISTS idx_dating_matches_user2 ON dating_matches(user2_id);

-- RLS
ALTER TABLE dating_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dating_swipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dating_matches ENABLE ROW LEVEL SECURITY;

-- Политики dating_profiles
CREATE POLICY "dating_profiles_manage_own"
  ON dating_profiles FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "dating_profiles_select_active"
  ON dating_profiles FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Политики dating_swipes
CREATE POLICY "dating_swipes_manage_own"
  ON dating_swipes FOR ALL
  TO authenticated
  USING (auth.uid() = swiper_id)
  WITH CHECK (auth.uid() = swiper_id);

-- Политики dating_matches
CREATE POLICY "dating_matches_select_own"
  ON dating_matches FOR SELECT
  TO authenticated
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Auto-match функция: если оба лайкнули, создаём match
CREATE OR REPLACE FUNCTION check_dating_match()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.direction IN ('like', 'superlike') THEN
    IF EXISTS (
      SELECT 1 FROM dating_swipes
      WHERE swiper_id = NEW.swiped_id
        AND swiped_id = NEW.swiper_id
        AND direction IN ('like', 'superlike')
    ) THEN
      INSERT INTO dating_matches (user1_id, user2_id)
      VALUES (LEAST(NEW.swiper_id, NEW.swiped_id), GREATEST(NEW.swiper_id, NEW.swiped_id))
      ON CONFLICT (user1_id, user2_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_dating_match
AFTER INSERT ON dating_swipes
FOR EACH ROW EXECUTE FUNCTION check_dating_match();
