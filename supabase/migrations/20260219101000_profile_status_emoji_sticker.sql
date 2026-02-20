-- Profile status: emoji + sticker (publicly visible)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status_emoji TEXT,
  ADD COLUMN IF NOT EXISTS status_sticker_url TEXT;

-- Enable realtime updates for presence/status
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  EXCEPTION
    WHEN duplicate_object THEN
      -- already added
      NULL;
    WHEN undefined_object THEN
      -- publication might not exist in some environments
      NULL;
  END;
END $$;
