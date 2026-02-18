-- Таблица каналов (публичные чаты как в Telegram)
CREATE TABLE public.channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  owner_id UUID NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT true,
  member_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Участники канала
CREATE TABLE public.channel_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'member'
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

-- Сообщения в каналах
CREATE TABLE public.channel_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Включаем RLS
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_messages ENABLE ROW LEVEL SECURITY;

-- Политики для каналов
CREATE POLICY "Public channels are viewable by everyone"
ON public.channels FOR SELECT
USING (is_public = true);

CREATE POLICY "Channel members can view their channels"
ON public.channels FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.channel_members
    WHERE channel_id = channels.id AND user_id = auth.uid()
  )
);

CREATE POLICY "Authenticated users can create channels"
ON public.channels FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Channel owner can update their channel"
ON public.channels FOR UPDATE
USING (owner_id = auth.uid());

CREATE POLICY "Channel owner can delete their channel"
ON public.channels FOR DELETE
USING (owner_id = auth.uid());

-- Политики для участников каналов
CREATE POLICY "Anyone can view channel members of public channels"
ON public.channel_members FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.channels
    WHERE id = channel_members.channel_id AND is_public = true
  )
);

CREATE POLICY "Members can view their channel's members"
ON public.channel_members FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.channel_members cm
    WHERE cm.channel_id = channel_members.channel_id AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can join public channels"
ON public.channel_members FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.channels
    WHERE id = channel_members.channel_id AND is_public = true
  )
);

CREATE POLICY "Users can leave channels"
ON public.channel_members FOR DELETE
USING (user_id = auth.uid());

CREATE POLICY "Channel owner/admin can manage members"
ON public.channel_members FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.channel_members
    WHERE channel_id = channel_members.channel_id 
    AND user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Политики для сообщений каналов
CREATE POLICY "Anyone can view messages in public channels"
ON public.channel_messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.channels
    WHERE id = channel_messages.channel_id AND is_public = true
  )
);

CREATE POLICY "Members can view messages in their channels"
ON public.channel_messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.channel_members
    WHERE channel_id = channel_messages.channel_id AND user_id = auth.uid()
  )
);

CREATE POLICY "Members can send messages to channels"
ON public.channel_messages FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.channel_members
    WHERE channel_id = channel_messages.channel_id AND user_id = auth.uid()
  )
);

-- Индексы для производительности
CREATE INDEX idx_channel_members_channel ON public.channel_members(channel_id);
CREATE INDEX idx_channel_members_user ON public.channel_members(user_id);
CREATE INDEX idx_channel_messages_channel ON public.channel_messages(channel_id);
CREATE INDEX idx_channel_messages_created ON public.channel_messages(created_at DESC);

-- Триггер для обновления member_count
CREATE OR REPLACE FUNCTION public.update_channel_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.channels SET member_count = member_count + 1 WHERE id = NEW.channel_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.channels SET member_count = member_count - 1 WHERE id = OLD.channel_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_update_channel_member_count
AFTER INSERT OR DELETE ON public.channel_members
FOR EACH ROW EXECUTE FUNCTION public.update_channel_member_count();

-- Включаем realtime для сообщений каналов
ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_messages;

-- Функция создания канала с автоматическим добавлением владельца
CREATE OR REPLACE FUNCTION public.create_channel(
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL,
  p_is_public BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_channel_id UUID;
BEGIN
  -- Создаём канал
  INSERT INTO public.channels (name, description, avatar_url, owner_id, is_public)
  VALUES (p_name, p_description, p_avatar_url, auth.uid(), p_is_public)
  RETURNING id INTO new_channel_id;
  
  -- Добавляем владельца как участника
  INSERT INTO public.channel_members (channel_id, user_id, role)
  VALUES (new_channel_id, auth.uid(), 'owner');
  
  RETURN new_channel_id;
END;
$$;