-- Star Reactions: paid emoji reactions on messages
-- Migration: 20260311000003_star_reactions

CREATE TABLE public.star_reactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stars_amount INT NOT NULL CHECK (stars_amount > 0),
  emoji TEXT NOT NULL DEFAULT '⭐',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

CREATE INDEX idx_star_reactions_message_id ON public.star_reactions(message_id);
CREATE INDEX idx_star_reactions_user_id ON public.star_reactions(user_id);

ALTER TABLE public.star_reactions ENABLE ROW LEVEL SECURITY;

-- SELECT: all authenticated users
CREATE POLICY "star_reactions_select_authenticated"
  ON public.star_reactions FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: only own user_id
CREATE POLICY "star_reactions_insert_own"
  ON public.star_reactions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE: only own user_id
CREATE POLICY "star_reactions_update_own"
  ON public.star_reactions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: only own user_id
CREATE POLICY "star_reactions_delete_own"
  ON public.star_reactions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
