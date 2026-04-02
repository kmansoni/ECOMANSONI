-- Добавляем поддержку скрытия лайков и отключения комментариев для постов
-- (Instagram-like privacy controls)

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS hide_likes_count boolean NOT NULL DEFAULT false;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS comments_disabled boolean NOT NULL DEFAULT false;

-- Индекс не нужен — фильтрация по этим полям не планируется
