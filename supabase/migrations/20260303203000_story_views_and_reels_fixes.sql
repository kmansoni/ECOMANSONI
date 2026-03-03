-- Просмотры Stories
CREATE TABLE IF NOT EXISTS public.story_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL,
  viewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(story_id, viewer_id)
);
CREATE INDEX IF NOT EXISTS idx_story_views_story ON story_views(story_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_views_viewer ON story_views(viewer_id, viewed_at DESC);

ALTER TABLE story_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read story views" ON story_views FOR SELECT USING (true);
CREATE POLICY "Users record own views" ON story_views FOR INSERT WITH CHECK (auth.uid() = viewer_id);

-- Story DM replies
CREATE TABLE IF NOT EXISTS public.story_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_story_replies_story ON story_replies(story_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_replies_recipient ON story_replies(recipient_id, created_at DESC);

ALTER TABLE story_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own replies" ON story_replies FOR SELECT 
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
CREATE POLICY "Users send replies" ON story_replies FOR INSERT 
  WITH CHECK (auth.uid() = sender_id);
