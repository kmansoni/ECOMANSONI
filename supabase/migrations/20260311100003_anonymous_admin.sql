-- Anonymous Admin: group_members + anonymous action logs
-- Migration: 20260311100003

-- Create group_members if not exists
CREATE TABLE IF NOT EXISTS public.group_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  is_anonymous BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

-- Add is_anonymous column if table already existed without it
ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT FALSE;

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'group_members' AND policyname = 'gm_select_members'
  ) THEN
    CREATE POLICY "gm_select_members" ON public.group_members
      FOR SELECT USING (
        auth.uid() IN (SELECT user_id FROM public.group_members WHERE group_id = group_members.group_id)
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'group_members' AND policyname = 'gm_insert_self'
  ) THEN
    CREATE POLICY "gm_insert_self" ON public.group_members
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'group_members' AND policyname = 'gm_update_admin'
  ) THEN
    CREATE POLICY "gm_update_admin" ON public.group_members
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM public.group_members gm
          WHERE gm.group_id = group_members.group_id
            AND gm.user_id = auth.uid()
            AND gm.role IN ('owner', 'admin')
        )
      );
  END IF;
END $$;

-- Anonymous admin action logs
CREATE TABLE IF NOT EXISTS public.anonymous_admin_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL,
  admin_user_id UUID NOT NULL REFERENCES auth.users(id),
  action_type TEXT NOT NULL CHECK (action_type IN ('message', 'pin', 'delete', 'ban', 'mute', 'edit_info')),
  target_user_id UUID,
  target_message_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anon_admin_group ON public.anonymous_admin_actions(group_id, created_at DESC);

ALTER TABLE public.anonymous_admin_actions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'anonymous_admin_actions' AND policyname = 'anon_admin_select_owner'
  ) THEN
    CREATE POLICY "anon_admin_select_owner" ON public.anonymous_admin_actions
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.group_members gm
          WHERE gm.group_id = anonymous_admin_actions.group_id
            AND gm.user_id = auth.uid()
            AND gm.role = 'owner'
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'anonymous_admin_actions' AND policyname = 'anon_admin_insert_service'
  ) THEN
    CREATE POLICY "anon_admin_insert_service" ON public.anonymous_admin_actions
      FOR INSERT WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;
