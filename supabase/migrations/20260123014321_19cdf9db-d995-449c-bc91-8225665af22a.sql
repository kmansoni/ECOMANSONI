-- =============================================
-- ЧАСТЬ 1: Stories система
-- =============================================

-- Таблица stories с 24ч истечением
CREATE TABLE public.stories (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    author_id UUID NOT NULL,
    media_url TEXT NOT NULL,
    media_type TEXT NOT NULL DEFAULT 'image',
    caption TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

-- Таблица просмотров stories
CREATE TABLE public.story_views (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
    viewer_id UUID NOT NULL,
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(story_id, viewer_id)
);

-- RLS для stories
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active stories"
ON public.stories FOR SELECT
USING (expires_at > now());

CREATE POLICY "Users can create own stories"
ON public.stories FOR INSERT
WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can delete own stories"
ON public.stories FOR DELETE
USING (auth.uid() = author_id);

-- RLS для story_views
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view story views"
ON public.story_views FOR SELECT
USING (true);

CREATE POLICY "Users can mark stories as viewed"
ON public.story_views FOR INSERT
WITH CHECK (auth.uid() = viewer_id);

-- Индексы для производительности
CREATE INDEX idx_stories_expires_at ON public.stories(expires_at);
CREATE INDEX idx_stories_author ON public.stories(author_id);
CREATE INDEX idx_story_views_story ON public.story_views(story_id);

-- =============================================
-- ЧАСТЬ 2: Расширение messages для медиа
-- =============================================

ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS media_url TEXT,
ADD COLUMN IF NOT EXISTS media_type TEXT,
ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

-- =============================================
-- ЧАСТЬ 3: Storage buckets
-- =============================================

-- Bucket для stories
INSERT INTO storage.buckets (id, name, public) 
VALUES ('stories-media', 'stories-media', true)
ON CONFLICT (id) DO NOTHING;

-- Bucket для chat медиа
INSERT INTO storage.buckets (id, name, public) 
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

-- Bucket для post медиа
INSERT INTO storage.buckets (id, name, public) 
VALUES ('post-media', 'post-media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies для stories-media
CREATE POLICY "Anyone can view stories media"
ON storage.objects FOR SELECT
USING (bucket_id = 'stories-media');

CREATE POLICY "Users can upload stories media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'stories-media' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete own stories media"
ON storage.objects FOR DELETE
USING (bucket_id = 'stories-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies для chat-media
CREATE POLICY "Anyone can view chat media"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-media');

CREATE POLICY "Users can upload chat media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'chat-media' AND auth.uid() IS NOT NULL);

-- Storage policies для post-media
CREATE POLICY "Anyone can view post media"
ON storage.objects FOR SELECT
USING (bucket_id = 'post-media');

CREATE POLICY "Users can upload post media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'post-media' AND auth.uid() IS NOT NULL);

-- =============================================
-- ЧАСТЬ 4: Real-time для ленты
-- =============================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_likes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;