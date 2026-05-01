-- Миграция: добавление phone в admin_users + seed владельца Джехангир Манусуров
-- Additive only. Не изменяет и не удаляет существующие данные.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Добавить столбец phone в admin_users (если не существует)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_phone
  ON public.admin_users (phone)
  WHERE phone IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Seed: Джехангир Манусуров — владелец платформы
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.admin_users (email, display_name, phone, status)
VALUES ('mansoni@list.ru', 'Джехангир Манусуров', '+79333222922', 'active')
ON CONFLICT (email) DO UPDATE
  SET
    display_name = EXCLUDED.display_name,
    phone        = COALESCE(public.admin_users.phone, EXCLUDED.phone),
    status       = CASE
                     WHEN public.admin_users.status = 'active' THEN 'active'
                     ELSE EXCLUDED.status
                   END;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Назначить роль owner
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.admin_user_roles (admin_user_id, role_id)
SELECT au.id, ar.id
FROM   public.admin_users  au
JOIN   public.admin_roles  ar ON ar.name = 'owner'
WHERE  au.email = 'mansoni@list.ru'
ON CONFLICT (admin_user_id, role_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Добавить в таблицу owners
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.owners (admin_user_id, mode)
SELECT id, 'single'
FROM   public.admin_users
WHERE  email = 'mansoni@list.ru'
ON CONFLICT (admin_user_id) DO NOTHING;
