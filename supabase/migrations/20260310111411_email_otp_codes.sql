-- Create table for storing email OTP codes (self-hosted auth, no Supabase Auth OTP dependency)
CREATE TABLE IF NOT EXISTS public.email_otp_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast email lookups
CREATE INDEX idx_email_otp_codes_email ON public.email_otp_codes(email);

-- Enable RLS — only service role can access (Edge Functions use service role key)
ALTER TABLE public.email_otp_codes ENABLE ROW LEVEL SECURITY;

-- Cleanup function for expired email OTPs
CREATE OR REPLACE FUNCTION public.cleanup_expired_email_otps()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    deleted_count integer;
BEGIN
    DELETE FROM public.email_otp_codes
    WHERE expires_at < now();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$;
