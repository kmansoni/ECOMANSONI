-- Добавляем поле для аудио-записи произношения имени (Instagram-style)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS name_pronunciation_url TEXT;

COMMENT ON COLUMN public.profiles.name_pronunciation_url
  IS 'URL аудиозаписи произношения имени пользователя (до 10 секунд)';
