-- Collab Reels: совместные публикации
CREATE TABLE IF NOT EXISTS reel_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  collaborator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(reel_id, collaborator_id)
);

CREATE INDEX IF NOT EXISTS idx_reel_collaborators_reel ON reel_collaborators(reel_id);
CREATE INDEX IF NOT EXISTS idx_reel_collaborators_user ON reel_collaborators(collaborator_id);

ALTER TABLE reel_collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Collaborators see invites" ON reel_collaborators
  FOR SELECT USING (
    auth.uid() = collaborator_id
    OR EXISTS (SELECT 1 FROM posts WHERE id = reel_id AND author_id = auth.uid())
  );

CREATE POLICY "Authors invite" ON reel_collaborators
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM posts WHERE id = reel_id AND author_id = auth.uid())
  );

CREATE POLICY "Collaborators respond" ON reel_collaborators
  FOR UPDATE USING (auth.uid() = collaborator_id);
