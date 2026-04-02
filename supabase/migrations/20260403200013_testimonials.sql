-- Testimonials: рекомендации от других пользователей
CREATE TABLE IF NOT EXISTS testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 10 AND 500),
  is_approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(author_id, target_user_id)
);

CREATE INDEX IF NOT EXISTS idx_testimonials_target ON testimonials(target_user_id);
CREATE INDEX IF NOT EXISTS idx_testimonials_author ON testimonials(author_id);

ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved testimonials visible" ON testimonials
  FOR SELECT USING (
    is_approved = true
    OR auth.uid() = target_user_id
    OR auth.uid() = author_id
  );

CREATE POLICY "Authors write" ON testimonials
  FOR INSERT WITH CHECK (auth.uid() = author_id AND auth.uid() != target_user_id);

CREATE POLICY "Target approves" ON testimonials
  FOR UPDATE USING (auth.uid() = target_user_id);

CREATE POLICY "Author or target deletes" ON testimonials
  FOR DELETE USING (auth.uid() = author_id OR auth.uid() = target_user_id);
