-- Мягкая блокировка (Restrict) как в Instagram
-- Таблица restricted_users уже существует (20260303210000) с колонками user_id, restricted_id
-- Расширяем: добавляем id (для PostgREST), индексы, RLS

ALTER TABLE public.restricted_users ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_restricted_users_user ON public.restricted_users(user_id);
CREATE INDEX IF NOT EXISTS idx_restricted_users_target ON public.restricted_users(restricted_id);

ALTER TABLE public.restricted_users ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "users_manage_own_restrictions" ON public.restricted_users
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
