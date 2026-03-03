-- Взаимодействия пользователя для ML-рекомендаций
CREATE TABLE IF NOT EXISTS public.user_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL, -- post, reel, story, profile, hashtag
  content_id UUID NOT NULL,
  interaction_type TEXT NOT NULL, -- view, like, comment, share, save, follow, dwell_time, skip
  value FLOAT DEFAULT 1.0, -- для dwell_time = секунды, для skip = -1
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_interactions_user ON user_interactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_content ON user_interactions(content_type, content_id);

-- Embedding-подобные профили пользователей (интересы как вектор)
CREATE TABLE IF NOT EXISTS public.user_embeddings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  interests JSONB DEFAULT '{}', -- {category: score} например {"food": 0.8, "travel": 0.6, "tech": 0.3}
  content_creators JSONB DEFAULT '{}', -- {creator_id: affinity_score}
  hashtag_affinities JSONB DEFAULT '{}', -- {hashtag: score}
  avg_session_minutes FLOAT DEFAULT 0,
  preferred_content_type TEXT DEFAULT 'mixed', -- photo, video, reels, mixed
  active_hours JSONB DEFAULT '{}', -- {hour: frequency}
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Похожие пользователи (collaborative filtering cache)
CREATE TABLE IF NOT EXISTS public.similar_users (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  similar_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  similarity_score FLOAT NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(user_id, similar_user_id)
);
CREATE INDEX IF NOT EXISTS idx_similar_users ON similar_users(user_id, similarity_score DESC);

-- Рекомендованный контент (предвычисленный)
CREATE TABLE IF NOT EXISTS public.recommended_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,
  content_id UUID NOT NULL,
  score FLOAT NOT NULL DEFAULT 0,
  reason TEXT, -- similar_users, topic_match, trending, creator_affinity
  is_served BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recommended ON recommended_content(user_id, is_served, score DESC);

-- A/B тестирование алгоритмов
CREATE TABLE IF NOT EXISTS public.ab_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  variants JSONB NOT NULL DEFAULT '[]', -- [{name, weight, config}]
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ab_assignments (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  experiment_id UUID NOT NULL REFERENCES ab_experiments(id) ON DELETE CASCADE,
  variant TEXT NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(user_id, experiment_id)
);

-- RLS
ALTER TABLE user_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE similar_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommended_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage interactions" ON user_interactions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users read embeddings" ON user_embeddings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users read similar" ON similar_users FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users read recommendations" ON recommended_content FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Anyone reads experiments" ON ab_experiments FOR SELECT USING (true);
CREATE POLICY "Users manage assignments" ON ab_assignments FOR ALL USING (auth.uid() = user_id);
