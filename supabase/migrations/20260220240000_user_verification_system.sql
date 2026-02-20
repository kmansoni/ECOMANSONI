-- =====================================================
-- USER VERIFICATION SYSTEM & PROFILE ENHANCEMENTS
-- =====================================================

-- Add missing fields to profiles for owner registration
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS full_name TEXT,
ADD COLUMN IF NOT EXISTS birth_date DATE,
ADD COLUMN IF NOT EXISTS age INTEGER,
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS professions TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS entity_type TEXT,
ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;

-- Create verification types enum
CREATE TYPE public.verification_type AS ENUM ('owner', 'verified', 'professional', 'business');

-- User verifications (badges)
CREATE TABLE IF NOT EXISTS public.user_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  verification_type verification_type NOT NULL,
  is_active BOOLEAN DEFAULT true,
  verified_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  verified_by_admin_id UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_verifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Anyone can read, only admins can update
CREATE POLICY "Verifications are viewable by authenticated users"
ON public.user_verifications FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Only admins can insert/update verifications"
ON public.user_verifications FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "Only admins can update verifications"
ON public.user_verifications FOR UPDATE
TO authenticated
USING (false);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_verifications_user_id ON public.user_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_verifications_type ON public.user_verifications(verification_type);

COMMENT ON TABLE public.user_verifications IS 'User verification badges (owner, verified, etc.)';
COMMENT ON COLUMN public.user_verifications.verification_type IS 'Type of verification: owner, verified, professional, business';
