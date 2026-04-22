-- =============================================================
-- Миграция: таблица настроек страховых провайдеров
-- Дата: 2026-04-21
-- =============================================================

-- Создаём таблицу настроек страховых провайдеров
CREATE TABLE IF NOT EXISTS public.insurance_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}',
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Индекс для быстрого поиска по ключу
CREATE UNIQUE INDEX IF NOT EXISTS idx_insurance_settings_key 
  ON public.insurance_settings (key);

-- RLS: только админы могут читать и писать
ALTER TABLE public.insurance_settings ENABLE ROW LEVEL SECURITY;

-- Политика для чтения (админы с соответствующей ролью)
DO $$ BEGIN
  CREATE POLICY "insurance_settings_read" ON public.insurance_settings
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM admin_users 
        WHERE admin_users.id = auth.uid() 
        AND admin_users.status = 'active'
        AND EXISTS (
          SELECT 1 FROM admin_user_roles 
          WHERE admin_user_roles.admin_user_id = admin_users.id 
          AND admin_user_roles.role_id IN (
            SELECT id FROM admin_roles WHERE name IN ('owner', 'administrator')
          )
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Политика для записи (только owner)
DO $$ BEGIN
  CREATE POLICY "insurance_settings_write" ON public.insurance_settings
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM admin_users 
        WHERE admin_users.id = auth.uid() 
        AND admin_users.status = 'active'
        AND EXISTS (
          SELECT 1 FROM admin_user_roles 
          WHERE admin_user_roles.admin_user_id = admin_users.id 
          AND admin_user_roles.role_id = (
            SELECT id FROM admin_roles WHERE name = 'owner' LIMIT 1
          )
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Триггер для обновления updated_at
CREATE OR REPLACE FUNCTION public.trg_insurance_settings_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS insurance_settings_updated_at ON public.insurance_settings;
CREATE TRIGGER insurance_settings_updated_at
  BEFORE UPDATE ON public.insurance_settings
  FOR EACH ROW EXECUTE FUNCTION public.trg_insurance_settings_updated_at();

-- Начальные настройки для СК Согласие (Е-ОСАГО)
INSERT INTO public.insurance_settings (key, value, description, is_active)
VALUES 
  ('soglasie_api', 
   '{"login": "", "subUser": "", "password": "", "apiUrl": "https://b2b.soglasie.ru/upload-test/online/api/eosago", "calcUrl": "https://b2b.soglasie.ru/upload-test/CCM/calcService", "tokenUrl": "https://b2b.soglasie.ru/diasoft-schema/graphiql/", "isTestMode": true}', 
   'Настройки API СК Согласие (Е-ОСАГО)', 
   true)
ON CONFLICT (key) DO NOTHING;

-- Готово
