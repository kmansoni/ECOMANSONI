-- Managed Bots (Bot API 9.6-10.0)

ALTER TABLE public.bots ADD COLUMN IF NOT EXISTS supports_guest_queries BOOLEAN DEFAULT false;
ALTER TABLE public.bots ADD COLUMN IF NOT EXISTS can_manage_bots BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS public.managed_bots (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id UUID NOT NULL,
    user_id BIGINT NOT NULL,
    username TEXT NOT NULL,
    first_name TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    access_settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(owner_id, user_id)
);

ALTER TABLE public.managed_bots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their managed bots" ON public.managed_bots FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "Users can create managed bots" ON public.managed_bots FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Users can update their managed bots" ON public.managed_bots FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Users can delete their managed bots" ON public.managed_bots FOR DELETE USING (owner_id = auth.uid());

CREATE INDEX idx_managed_bots_owner ON public.managed_bots(owner_id);