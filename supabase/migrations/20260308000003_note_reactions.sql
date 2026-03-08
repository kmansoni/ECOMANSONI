-- ============================================================
-- Migration: note_reactions table
-- Stores emoji reactions to user status notes (Instagram Notes style).
-- One reaction per (reactor, note_owner) pair — upsert on conflict.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.note_reactions (
  reactor_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji           TEXT NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 8),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (reactor_id, note_owner_id)
);

-- Index for fetching all reactions on a note owner's note
CREATE INDEX IF NOT EXISTS idx_note_reactions_owner
  ON public.note_reactions (note_owner_id);

-- RLS
ALTER TABLE public.note_reactions ENABLE ROW LEVEL SECURITY;

-- Note reactions are visible to: the note owner, the reactor, and followers of the note owner
CREATE POLICY "note_reactions_select"
  ON public.note_reactions FOR SELECT
  USING (
    note_owner_id = auth.uid()
    OR reactor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.followers
      WHERE follower_id = auth.uid()
        AND following_id = note_reactions.note_owner_id
    )
  );

-- Only the reactor can insert/update their own reactions
CREATE POLICY "note_reactions_insert"
  ON public.note_reactions FOR INSERT
  WITH CHECK (reactor_id = auth.uid());

CREATE POLICY "note_reactions_update"
  ON public.note_reactions FOR UPDATE
  USING (reactor_id = auth.uid())
  WITH CHECK (reactor_id = auth.uid());

-- Only the reactor can delete their own reactions
CREATE POLICY "note_reactions_delete"
  ON public.note_reactions FOR DELETE
  USING (reactor_id = auth.uid());
