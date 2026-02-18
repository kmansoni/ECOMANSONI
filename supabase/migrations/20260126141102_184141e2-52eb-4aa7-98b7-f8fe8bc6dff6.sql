-- Сначала удалим все существующие политики для channels
DROP POLICY IF EXISTS "Public channels are viewable by everyone" ON public.channels;
DROP POLICY IF EXISTS "Users can view channels they are members of" ON public.channels;
DROP POLICY IF EXISTS "Channel owners can update their channels" ON public.channels;
DROP POLICY IF EXISTS "Authenticated users can create channels" ON public.channels;

-- Создаём простые политики без рекурсии

-- Публичные каналы видны всем
CREATE POLICY "Public channels viewable by all"
ON public.channels
FOR SELECT
USING (is_public = true);

-- Владелец может обновлять канал
CREATE POLICY "Owners can update channels"
ON public.channels
FOR UPDATE
USING (auth.uid() = owner_id);

-- Авторизованные пользователи могут создавать каналы
CREATE POLICY "Authenticated can create channels"
ON public.channels
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Владелец может удалять канал
CREATE POLICY "Owners can delete channels"
ON public.channels
FOR DELETE
USING (auth.uid() = owner_id);