-- P0C Create Reels MVP: idempotent publish key
--
-- Adds `client_publish_id` and enforces uniqueness per author when present.

ALTER TABLE public.reels
  ADD COLUMN IF NOT EXISTS client_publish_id UUID;

-- Allow legacy rows (NULL) while enforcing idempotency for new writes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reels_author_client_publish_id_uniq
  ON public.reels(author_id, client_publish_id)
  WHERE client_publish_id IS NOT NULL;
