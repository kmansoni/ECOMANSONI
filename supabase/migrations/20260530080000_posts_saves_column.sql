-- ============================================================================
-- Phase 1 EPIC J: Extend posts table with saves_count
--
-- Required for content type breakdown metrics
-- ============================================================================

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS saves_count INTEGER NOT NULL DEFAULT 0;

-- Create index for saves
CREATE INDEX IF NOT EXISTS idx_posts_saves ON public.posts(saves_count DESC);

-- Summary:
-- - ✅ Added saves_count column to posts table
-- ============================================================================