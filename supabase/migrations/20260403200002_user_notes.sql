-- Мини-статусы (Notes) как в Instagram DM
-- Таблица user_status_notes уже существует из 20260303211000 — расширяем её
-- Добавляем недостающие колонки (audience, id) к user_status_notes

ALTER TABLE public.user_status_notes
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS audience TEXT DEFAULT 'followers' CHECK (audience IN ('followers', 'close_friends'));

-- Ограничение длины текста
DO $$ BEGIN
  ALTER TABLE public.user_status_notes ADD CHECK (char_length(text) <= 60);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Дефолт для expires_at
ALTER TABLE public.user_status_notes ALTER COLUMN expires_at SET DEFAULT (now() + interval '24 hours');

CREATE INDEX IF NOT EXISTS idx_user_status_notes_expires ON public.user_status_notes(expires_at);

ALTER TABLE public.user_status_notes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "users_manage_own_status_notes" ON public.user_status_notes
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anyone_can_view_active_status_notes" ON public.user_status_notes
    FOR SELECT USING (expires_at > now());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
