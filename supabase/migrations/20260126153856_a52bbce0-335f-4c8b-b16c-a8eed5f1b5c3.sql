-- Создаём таблицу для групповых чатов
CREATE TABLE IF NOT EXISTS public.group_chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  owner_id UUID NOT NULL,
  member_count INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Участники групп
CREATE TABLE IF NOT EXISTS public.group_chat_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.group_chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- Сообщения в группах
CREATE TABLE IF NOT EXISTS public.group_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.group_chats(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS для group_chats
ALTER TABLE public.group_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view groups"
ON public.group_chats FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.group_chat_members gcm
    WHERE gcm.group_id = id AND gcm.user_id = auth.uid()
  )
);

CREATE POLICY "Auth users can create groups"
ON public.group_chats FOR INSERT
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner can update group"
ON public.group_chats FOR UPDATE
USING (owner_id = auth.uid());

CREATE POLICY "Owner can delete group"
ON public.group_chats FOR DELETE
USING (owner_id = auth.uid());

-- RLS для group_chat_members
ALTER TABLE public.group_chat_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view members"
ON public.group_chat_members FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.group_chat_members gcm2
    WHERE gcm2.group_id = group_id AND gcm2.user_id = auth.uid()
  )
);

CREATE POLICY "Group admins can add members"
ON public.group_chat_members FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.group_chat_members gcm
    WHERE gcm.group_id = group_id 
    AND gcm.user_id = auth.uid()
    AND gcm.role IN ('owner', 'admin')
  )
  OR user_id = auth.uid() -- Or adding yourself as owner
);

CREATE POLICY "Members can leave"
ON public.group_chat_members FOR DELETE
USING (user_id = auth.uid());

-- RLS для group_chat_messages
ALTER TABLE public.group_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view messages"
ON public.group_chat_messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.group_chat_members gcm
    WHERE gcm.group_id = group_id AND gcm.user_id = auth.uid()
  )
);

CREATE POLICY "Members can send messages"
ON public.group_chat_messages FOR INSERT
WITH CHECK (
  sender_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.group_chat_members gcm
    WHERE gcm.group_id = group_id AND gcm.user_id = auth.uid()
  )
);

-- Функция для создания группы
CREATE OR REPLACE FUNCTION public.create_group_chat(
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_group_id UUID;
BEGIN
  -- Создаём группу
  INSERT INTO public.group_chats (name, description, avatar_url, owner_id)
  VALUES (p_name, p_description, p_avatar_url, auth.uid())
  RETURNING id INTO new_group_id;
  
  -- Добавляем создателя как владельца
  INSERT INTO public.group_chat_members (group_id, user_id, role)
  VALUES (new_group_id, auth.uid(), 'owner');
  
  RETURN new_group_id;
END;
$$;

-- Триггер для подсчёта участников
CREATE OR REPLACE FUNCTION public.update_group_member_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.group_chats SET member_count = member_count + 1 WHERE id = NEW.group_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.group_chats SET member_count = member_count - 1 WHERE id = OLD.group_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER on_group_member_change
AFTER INSERT OR DELETE ON public.group_chat_members
FOR EACH ROW
EXECUTE FUNCTION public.update_group_member_count();

-- Индексы
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON public.group_chat_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON public.group_chat_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_group_id ON public.group_chat_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_created_at ON public.group_chat_messages(created_at DESC);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_chat_messages;