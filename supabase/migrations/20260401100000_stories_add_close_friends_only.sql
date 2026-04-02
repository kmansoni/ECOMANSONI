-- Добавляет поддержку Close Friends Stories
-- Колонка close_friends_only: истории видны только близким друзьям (зелёное кольцо)

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS close_friends_only BOOLEAN NOT NULL DEFAULT false;

-- Индекс для фильтрации close_friends историй
CREATE INDEX IF NOT EXISTS idx_stories_close_friends
  ON public.stories (author_id, close_friends_only)
  WHERE close_friends_only = true;

-- RLS: close_friends-only истории видны только автору и его близким друзьям
-- Заменяем существующую политику SELECT более строгой
DROP POLICY IF EXISTS "Anyone can view active stories" ON public.stories;

CREATE POLICY "stories_select_with_close_friends" ON public.stories
  FOR SELECT USING (
    -- Автор видит все свои истории
    author_id = auth.uid()
    OR (
      -- Обычные истории видны всем
      close_friends_only = false
    )
    OR (
      -- Close friends истории видны только близким друзьям
      close_friends_only = true
      AND EXISTS (
        SELECT 1 FROM public.close_friends cf
        WHERE cf.user_id = stories.author_id
          AND cf.friend_id = auth.uid()
      )
    )
  );
