-- Add UPDATE RLS policy for followers table (required for UPSERT operations)
-- Without this, upsert() fails silently when record already exists

CREATE POLICY "Users can update own follows" ON public.followers
    FOR UPDATE USING (auth.uid() = follower_id) 
    WITH CHECK (auth.uid() = follower_id AND follower_id != following_id);
