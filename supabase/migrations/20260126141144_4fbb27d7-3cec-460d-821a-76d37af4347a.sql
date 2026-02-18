-- Удаляем ВСЕ старые политики для channels (включая дублирующиеся)
DROP POLICY IF EXISTS "Public channels viewable by all" ON public.channels;
DROP POLICY IF EXISTS "Owners can update channels" ON public.channels;
DROP POLICY IF EXISTS "Authenticated can create channels" ON public.channels;
DROP POLICY IF EXISTS "Owners can delete channels" ON public.channels;
DROP POLICY IF EXISTS "Authenticated users can create channels" ON public.channels;
DROP POLICY IF EXISTS "Channel members can view their channels" ON public.channels;
DROP POLICY IF EXISTS "Channel owner can delete their channel" ON public.channels;
DROP POLICY IF EXISTS "Channel owner can update their channel" ON public.channels;
DROP POLICY IF EXISTS "Public channels are viewable by everyone" ON public.channels;

-- Создаём простые политики БЕЗ рекурсии

-- Публичные каналы видны всем
CREATE POLICY "channels_public_select"
ON public.channels
FOR SELECT
USING (is_public = true);

-- Владелец может видеть свои каналы
CREATE POLICY "channels_owner_select"
ON public.channels
FOR SELECT
USING (owner_id = auth.uid());

-- Владелец может обновлять свой канал
CREATE POLICY "channels_owner_update"
ON public.channels
FOR UPDATE
USING (owner_id = auth.uid());

-- Авторизованные могут создавать (owner_id должен быть их id)
CREATE POLICY "channels_insert"
ON public.channels
FOR INSERT
WITH CHECK (owner_id = auth.uid());

-- Владелец может удалять свой канал
CREATE POLICY "channels_owner_delete"
ON public.channels
FOR DELETE
USING (owner_id = auth.uid());