-- Reel engagement: saves, reposts, shares + counters on reels

-- Add counters to reels
ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS saves_count INTEGER DEFAULT 0;
ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS reposts_count INTEGER DEFAULT 0;
ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS shares_count INTEGER DEFAULT 0;

-- Saves (bookmark)
CREATE TABLE IF NOT EXISTS public.reel_saves (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (reel_id, user_id)
);

ALTER TABLE public.reel_saves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reel saves"
ON public.reel_saves FOR SELECT
USING (true);

CREATE POLICY "Users can save reels"
ON public.reel_saves FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unsave reels"
ON public.reel_saves FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_reel_saves_reel_id ON public.reel_saves(reel_id);
CREATE INDEX IF NOT EXISTS idx_reel_saves_user_id ON public.reel_saves(user_id);

-- Reposts (toggle per user)
CREATE TABLE IF NOT EXISTS public.reel_reposts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (reel_id, user_id)
);

ALTER TABLE public.reel_reposts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reel reposts"
ON public.reel_reposts FOR SELECT
USING (true);

CREATE POLICY "Users can repost reels"
ON public.reel_reposts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can undo reposts"
ON public.reel_reposts FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_reel_reposts_reel_id ON public.reel_reposts(reel_id);
CREATE INDEX IF NOT EXISTS idx_reel_reposts_user_id ON public.reel_reposts(user_id);

-- Shares (event per target)
CREATE TABLE IF NOT EXISTS public.reel_shares (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.reel_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reel shares"
ON public.reel_shares FOR SELECT
USING (true);

CREATE POLICY "Users can record reel shares"
ON public.reel_shares FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_reel_shares_reel_id ON public.reel_shares(reel_id);
CREATE INDEX IF NOT EXISTS idx_reel_shares_user_id ON public.reel_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_reel_shares_created_at ON public.reel_shares(created_at DESC);

-- Counters
CREATE OR REPLACE FUNCTION public.update_reel_saves_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reels SET saves_count = saves_count + 1 WHERE id = NEW.reel_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reels SET saves_count = GREATEST(0, saves_count - 1) WHERE id = OLD.reel_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_reel_save_update_count ON public.reel_saves;
CREATE TRIGGER on_reel_save_update_count
  AFTER INSERT OR DELETE ON public.reel_saves
  FOR EACH ROW
  EXECUTE FUNCTION public.update_reel_saves_count();

CREATE OR REPLACE FUNCTION public.update_reel_reposts_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reels SET reposts_count = reposts_count + 1 WHERE id = NEW.reel_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reels SET reposts_count = GREATEST(0, reposts_count - 1) WHERE id = OLD.reel_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_reel_repost_update_count ON public.reel_reposts;
CREATE TRIGGER on_reel_repost_update_count
  AFTER INSERT OR DELETE ON public.reel_reposts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_reel_reposts_count();

CREATE OR REPLACE FUNCTION public.update_reel_shares_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.reels SET shares_count = shares_count + 1 WHERE id = NEW.reel_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_reel_share_update_count ON public.reel_shares;
CREATE TRIGGER on_reel_share_update_count
  AFTER INSERT ON public.reel_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.update_reel_shares_count();
