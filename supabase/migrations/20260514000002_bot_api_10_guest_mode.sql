-- Bot API 10.0 Guest Mode support
-- Add supports_guest_queries to bots table

ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS supports_guest_queries BOOLEAN DEFAULT FALSE;