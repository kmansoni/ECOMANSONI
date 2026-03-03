-- Professional Dashboard
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'personal'; -- personal, creator, business
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS action_email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS action_phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS action_address TEXT;

-- Guides / Collections
CREATE TABLE IF NOT EXISTS public.guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  cover_url TEXT,
  type TEXT DEFAULT 'posts', -- posts, products, places
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.guide_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id UUID NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL, -- post, reel, product
  content_id UUID NOT NULL,
  note TEXT,
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Saved collections
CREATE TABLE IF NOT EXISTS public.saved_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cover_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.saved_collection_items (
  collection_id UUID NOT NULL REFERENCES saved_collections(id) ON DELETE CASCADE,
  post_id UUID NOT NULL,
  added_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(collection_id, post_id)
);

-- Follow requests (private accounts)
CREATE TABLE IF NOT EXISTS public.follow_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending', -- pending, accepted, rejected
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(requester_id, target_id)
);

-- Tagged posts
CREATE TABLE IF NOT EXISTS public.post_user_tags (
  post_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  x FLOAT DEFAULT 0.5,
  y FLOAT DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(post_id, user_id)
);

-- Profile notes
CREATE TABLE IF NOT EXISTS public.user_notes (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(user_id, target_id)
);

-- DM: Notes (status notes like Instagram Notes)
CREATE TABLE IF NOT EXISTS public.user_status_notes (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  emoji TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- DM: Location sharing
CREATE TABLE IF NOT EXISTS public.shared_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lat FLOAT NOT NULL,
  lng FLOAT NOT NULL,
  name TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- DM: Chat themes
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'default';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS emoji TEXT DEFAULT '❤️';

-- DM: Message editing
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_silent BOOLEAN DEFAULT false;

-- Explore: Location pages
CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  lat FLOAT NOT NULL,
  lng FLOAT NOT NULL,
  category TEXT,
  posts_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_locations_name ON locations USING gin(to_tsvector('russian', name));

-- RLS
ALTER TABLE guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_user_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_status_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads guides" ON guides FOR SELECT USING (true);
CREATE POLICY "Authors manage guides" ON guides FOR ALL USING (auth.uid() = author_id);
CREATE POLICY "Anyone reads guide items" ON guide_items FOR SELECT USING (true);
CREATE POLICY "Users manage saved collections" ON saved_collections FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage collection items" ON saved_collection_items FOR ALL USING (
  EXISTS(SELECT 1 FROM saved_collections WHERE id = collection_id AND user_id = auth.uid())
);
CREATE POLICY "Users manage follow requests" ON follow_requests FOR ALL USING (auth.uid() IN (requester_id, target_id));
CREATE POLICY "Anyone reads tags" ON post_user_tags FOR SELECT USING (true);
CREATE POLICY "Users manage notes" ON user_notes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage status notes" ON user_status_notes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Anyone reads status notes" ON user_status_notes FOR SELECT USING (true);
CREATE POLICY "Users read shared locations" ON shared_locations FOR SELECT USING (true);
CREATE POLICY "Users create shared locations" ON shared_locations FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Anyone reads locations" ON locations FOR SELECT USING (true);
