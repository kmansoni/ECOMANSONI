-- ============================================================================
-- FIX: Email Router RLS — заменить auth.jwt()->>'email' на auth.uid() + profiles
--
-- Проблема: Supabase JWT не всегда содержит email, поэтому политики
--   USING (to_email = auth.jwt() ->> 'email')
--   USING (mailbox_email = auth.jwt() ->> 'email')
-- могут не работать (пользователь не видит свой inbox/threads).
--
-- Решение: используем auth.uid() + подзапрос к auth.users для email,
-- или SECURITY DEFINER функцию get_user_email().
-- ============================================================================

-- 1. Создаём helper-функцию для получения email текущего пользователя
--    из auth.users напрямую (SECURITY DEFINER, обходит RLS)
CREATE OR REPLACE FUNCTION public.get_user_email()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT email
    FROM auth.users
    WHERE id = auth.uid()
  );
END;
$$;

-- 2. Фиксим email_inbox RLS policies
DROP POLICY IF EXISTS "Users can read own inbox" ON public.email_inbox;
DROP POLICY IF EXISTS "Users can insert to own inbox" ON public.email_inbox;
DROP POLICY IF EXISTS "Users can update own inbox read status" ON public.email_inbox;

-- Пользователь читает только свои входящие (по email из auth.users)
CREATE POLICY "Users can read own inbox" ON public.email_inbox
  FOR SELECT USING (to_email = public.get_user_email());

-- Пользователь может вставлять (для импортов/миграций), если email совпадает
CREATE POLICY "Users can insert to own inbox" ON public.email_inbox
  FOR INSERT WITH CHECK (
    to_email = public.get_user_email()
    OR public.get_user_email() IS NULL  -- сервис без auth
  );

-- Пользователь обновляет только свои письма
CREATE POLICY "Users can update own inbox read status" ON public.email_inbox
  FOR UPDATE USING (to_email = public.get_user_email());

-- 3. Фиксим email_threads RLS policies
DROP POLICY IF EXISTS "Users can read own threads" ON public.email_threads;
DROP POLICY IF EXISTS "Users can insert own threads" ON public.email_threads;
DROP POLICY IF EXISTS "Users can update own threads" ON public.email_threads;

-- Пользователь читает только свои threads
CREATE POLICY "Users can read own threads" ON public.email_threads
  FOR SELECT USING (mailbox_email = public.get_user_email());

-- Пользователь создаёт thread для своего email
CREATE POLICY "Users can insert own threads" ON public.email_threads
  FOR INSERT WITH CHECK (
    mailbox_email = public.get_user_email()
    OR public.get_user_email() IS NULL
  );

-- Пользователь обновляет только свои threads
CREATE POLICY "Users can update own threads" ON public.email_threads
  FOR UPDATE USING (mailbox_email = public.get_user_email());
