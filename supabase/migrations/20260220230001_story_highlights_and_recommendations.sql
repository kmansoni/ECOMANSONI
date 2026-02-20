-- =====================================================
-- Story Highlights (Актуальное) и Рекомендации
-- =====================================================

-- Таблица highlights (папки для группировки stories)
CREATE TABLE public.story_highlights (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    cover_url TEXT NOT NULL, -- URL обложки highlight
    position INTEGER NOT NULL DEFAULT 0, -- Порядок отображения
    is_visible BOOLEAN NOT NULL DEFAULT true, -- Показывать ли highlight другим
    privacy_level TEXT NOT NULL DEFAULT 'public', -- public, followers, private
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Связь между highlights и stories
CREATE TABLE public.highlight_stories (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    highlight_id UUID NOT NULL REFERENCES public.story_highlights(id) ON DELETE CASCADE,
    story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0, -- Порядок story внутри highlight
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(highlight_id, story_id)
);

-- Таблица рекомендуемых пользователей
CREATE TABLE public.recommended_users (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    recommended_by TEXT NOT NULL DEFAULT 'system', -- system, trending, new
    priority INTEGER NOT NULL DEFAULT 0, -- Чем выше, тем выше в списке
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id)
);

-- =====================================================
-- Индексы
-- =====================================================

CREATE INDEX idx_story_highlights_user ON public.story_highlights(user_id);
CREATE INDEX idx_story_highlights_visible ON public.story_highlights(user_id, is_visible);
CREATE INDEX idx_highlight_stories_highlight ON public.highlight_stories(highlight_id);
CREATE INDEX idx_highlight_stories_story ON public.highlight_stories(story_id);
CREATE INDEX idx_recommended_users_active ON public.recommended_users(is_active, priority DESC);

-- =====================================================
-- RLS Policies
-- =====================================================

-- story_highlights RLS
ALTER TABLE public.story_highlights ENABLE ROW LEVEL SECURITY;

-- Просмотр highlights с учетом приватности
CREATE POLICY "Users can view public highlights"
ON public.story_highlights FOR SELECT
USING (
    privacy_level = 'public' 
    OR user_id = auth.uid()
    OR (
        privacy_level = 'followers' 
        AND EXISTS (
            SELECT 1 FROM public.followers 
            WHERE follower_id = auth.uid() 
            AND following_id = user_id
        )
    )
);

-- Создание своих highlights
CREATE POLICY "Users can create own highlights"
ON public.story_highlights FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Обновление своих highlights
CREATE POLICY "Users can update own highlights"
ON public.story_highlights FOR UPDATE
USING (auth.uid() = user_id);

-- Удаление своих highlights
CREATE POLICY "Users can delete own highlights"
ON public.story_highlights FOR DELETE
USING (auth.uid() = user_id);

-- highlight_stories RLS
ALTER TABLE public.highlight_stories ENABLE ROW LEVEL SECURITY;

-- Просмотр stories в highlights (с учетом приватности highlight)
CREATE POLICY "Users can view highlight stories"
ON public.highlight_stories FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.story_highlights 
        WHERE id = highlight_id 
        AND (
            privacy_level = 'public' 
            OR user_id = auth.uid()
            OR (
                privacy_level = 'followers' 
                AND EXISTS (
                    SELECT 1 FROM public.followers 
                    WHERE follower_id = auth.uid() 
                    AND following_id = user_id
                )
            )
        )
    )
);

-- Добавление stories в свои highlights
CREATE POLICY "Users can add stories to own highlights"
ON public.highlight_stories FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.story_highlights 
        WHERE id = highlight_id 
        AND user_id = auth.uid()
    )
);

-- Удаление stories из своих highlights
CREATE POLICY "Users can remove stories from own highlights"
ON public.highlight_stories FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.story_highlights 
        WHERE id = highlight_id 
        AND user_id = auth.uid()
    )
);

-- recommended_users RLS
ALTER TABLE public.recommended_users ENABLE ROW LEVEL SECURITY;

-- Любой может видеть активные рекомендации
CREATE POLICY "Anyone can view active recommendations"
ON public.recommended_users FOR SELECT
USING (is_active = true);

-- =====================================================
-- Функции
-- =====================================================

-- Функция для обновления updated_at у highlights
CREATE OR REPLACE FUNCTION public.update_highlight_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_story_highlights_updated_at
    BEFORE UPDATE ON public.story_highlights
    FOR EACH ROW
    EXECUTE FUNCTION public.update_highlight_updated_at();

-- Функция для получения рекомендаций для нового пользователя
CREATE OR REPLACE FUNCTION public.get_recommended_users_for_new_user(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    user_id UUID,
    display_name TEXT,
    avatar_url TEXT,
    verified BOOLEAN,
    followers_count BIGINT,
    priority INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.user_id,
        p.display_name,
        p.avatar_url,
        p.verified,
        COUNT(DISTINCT f.follower_id) as followers_count,
        r.priority
    FROM public.recommended_users r
    INNER JOIN public.profiles p ON p.user_id = r.user_id
    LEFT JOIN public.followers f ON f.following_id = r.user_id
    WHERE r.is_active = true
    GROUP BY p.user_id, p.display_name, p.avatar_url, p.verified, r.priority
    ORDER BY r.priority DESC, followers_count DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Функция для создания highlight из expired story
CREATE OR REPLACE FUNCTION public.create_highlight_from_story(
    p_story_id UUID,
    p_highlight_title TEXT,
    p_highlight_cover_url TEXT
)
RETURNS UUID AS $$
DECLARE
    v_highlight_id UUID;
    v_user_id UUID;
BEGIN
    -- Получаем автора story
    SELECT author_id INTO v_user_id
    FROM public.stories
    WHERE id = p_story_id;
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Story not found';
    END IF;
    
    IF v_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Can only create highlights from own stories';
    END IF;
    
    -- Создаем highlight
    INSERT INTO public.story_highlights (user_id, title, cover_url)
    VALUES (v_user_id, p_highlight_title, p_highlight_cover_url)
    RETURNING id INTO v_highlight_id;
    
    -- Добавляем story в highlight
    INSERT INTO public.highlight_stories (highlight_id, story_id, position)
    VALUES (v_highlight_id, p_story_id, 0);
    
    RETURN v_highlight_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.story_highlights IS 'Папки для группировки stories (Актуальное, как highlights в Instagram)';
COMMENT ON TABLE public.highlight_stories IS 'Связь между highlights и stories';
COMMENT ON TABLE public.recommended_users IS 'Рекомендуемые пользователи для новых юзеров';
