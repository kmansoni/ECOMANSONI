-- Carousel support migration
-- Adds caption column to post_media for per-slide captions in carousel posts

ALTER TABLE public.post_media
  ADD COLUMN IF NOT EXISTS caption TEXT;

-- Index for carousel ordering
CREATE INDEX IF NOT EXISTS idx_post_media_post_order
  ON public.post_media(post_id, sort_order);
