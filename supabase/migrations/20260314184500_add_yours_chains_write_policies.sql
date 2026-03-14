-- Allow authenticated creators to create and manage their own Add Yours chains.
DROP POLICY IF EXISTS "Users create own add_yours chains" ON public.add_yours_chains;
CREATE POLICY "Users create own add_yours chains"
ON public.add_yours_chains
FOR INSERT
WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Creators update own add_yours chains" ON public.add_yours_chains;
CREATE POLICY "Creators update own add_yours chains"
ON public.add_yours_chains
FOR UPDATE
USING (auth.uid() = creator_id)
WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Creators delete own add_yours chains" ON public.add_yours_chains;
CREATE POLICY "Creators delete own add_yours chains"
ON public.add_yours_chains
FOR DELETE
USING (auth.uid() = creator_id);
