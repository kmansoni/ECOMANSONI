-- Исправляем рекурсивную политику для channel_members
-- Удаляем проблемную политику
DROP POLICY IF EXISTS "Channel owner/admin can manage members" ON public.channel_members;

-- Создаём функцию для проверки роли в канале (избегаем рекурсии)
CREATE OR REPLACE FUNCTION public.is_channel_admin(_channel_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channel_members
    WHERE channel_id = _channel_id
    AND user_id = _user_id
    AND role IN ('owner', 'admin')
  )
$$;

-- Создаём функцию для проверки членства в канале (избегаем рекурсии)
CREATE OR REPLACE FUNCTION public.is_channel_member(_channel_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channel_members
    WHERE channel_id = _channel_id
    AND user_id = _user_id
  )
$$;

-- Удаляем старые политики
DROP POLICY IF EXISTS "Members can view their channel's members" ON public.channel_members;
DROP POLICY IF EXISTS "Members can view messages in their channels" ON public.channel_messages;
DROP POLICY IF EXISTS "Members can send messages to channels" ON public.channel_messages;

-- Пересоздаём политики с использованием функций
CREATE POLICY "Members can view their channel's members"
ON public.channel_members FOR SELECT
USING (public.is_channel_member(channel_id, auth.uid()));

CREATE POLICY "Channel admins can manage members"
ON public.channel_members FOR ALL
USING (public.is_channel_admin(channel_id, auth.uid()));

CREATE POLICY "Members can view messages in their channels"
ON public.channel_messages FOR SELECT
USING (public.is_channel_member(channel_id, auth.uid()));

CREATE POLICY "Members can send messages to channels"
ON public.channel_messages FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid() AND
  public.is_channel_member(channel_id, auth.uid())
);