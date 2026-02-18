-- Add last_seen_at to profiles for online status
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    type TEXT NOT NULL,
    actor_id UUID NOT NULL,
    post_id UUID,
    comment_id UUID,
    content TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "System can create notifications"
ON public.notifications FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
ON public.notifications FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(user_id, is_read);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Create reels table
CREATE TABLE IF NOT EXISTS public.reels (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    author_id UUID NOT NULL,
    video_url TEXT NOT NULL,
    thumbnail_url TEXT,
    description TEXT,
    music_title TEXT,
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    views_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.reels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reels"
ON public.reels FOR SELECT
USING (true);

CREATE POLICY "Users can create own reels"
ON public.reels FOR INSERT
WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can update own reels"
ON public.reels FOR UPDATE
USING (auth.uid() = author_id);

CREATE POLICY "Authors can delete own reels"
ON public.reels FOR DELETE
USING (auth.uid() = author_id);

-- Create reel_likes table
CREATE TABLE IF NOT EXISTS public.reel_likes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(reel_id, user_id)
);

ALTER TABLE public.reel_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reel likes"
ON public.reel_likes FOR SELECT
USING (true);

CREATE POLICY "Users can like reels"
ON public.reel_likes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike reels"
ON public.reel_likes FOR DELETE
USING (auth.uid() = user_id);

-- Create reel_views table
CREATE TABLE IF NOT EXISTS public.reel_views (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
    user_id UUID,
    session_id TEXT,
    viewed_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.reel_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reel views"
ON public.reel_views FOR SELECT
USING (true);

CREATE POLICY "Anyone can record reel views"
ON public.reel_views FOR INSERT
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_reels_author_id ON public.reels(author_id);
CREATE INDEX IF NOT EXISTS idx_reels_created_at ON public.reels(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reel_likes_reel_id ON public.reel_likes(reel_id);
CREATE INDEX IF NOT EXISTS idx_reel_likes_user_id ON public.reel_likes(user_id);

-- Create storage bucket for reels
INSERT INTO storage.buckets (id, name, public) VALUES ('reels-media', 'reels-media', true)
ON CONFLICT (id) DO NOTHING;