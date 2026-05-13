-- Bot API 10.0 enhancements: Guest Mode, API Token, Live Photos
-- Adds supports_guest_queries to bots, api_token field for bot payment auth

ALTER TABLE public.bots 
  ADD COLUMN IF NOT EXISTS supports_guest_queries BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS api_token TEXT UNIQUE;

-- Index for api_token lookups
CREATE INDEX IF NOT EXISTS idx_bots_api_token ON public.bots(api_token) WHERE api_token IS NOT NULL;