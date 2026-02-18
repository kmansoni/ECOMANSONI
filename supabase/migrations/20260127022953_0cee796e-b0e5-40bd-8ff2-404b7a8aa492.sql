-- ============================================
-- SEC-1: Restrict profiles to authenticated users only
-- SEC-2: Restrict bank_details access in agent_profiles  
-- SEC-5: Fix permissive RLS policies
-- D1: Add missing indexes for performance
-- D2: Create function for expired stories cleanup
-- D3: Add constraint for max stories per user
-- ============================================

-- SEC-1: Drop overly permissive profiles policy and create proper one
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON profiles;

CREATE POLICY "Profiles are viewable by authenticated users" 
ON profiles FOR SELECT 
TO authenticated
USING (true);

-- SEC-2: Restrict bank_details - only owner or admin can see their own agent profile
DROP POLICY IF EXISTS "Users can view own agent profile" ON agent_profiles;

CREATE POLICY "Users can view own agent profile with bank details" 
ON agent_profiles FOR SELECT 
TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

-- SEC-5: Fix permissive INSERT/UPDATE/DELETE policies
-- Fix stories policies
DROP POLICY IF EXISTS "Anyone can create stories" ON stories;
DROP POLICY IF EXISTS "Users can create own stories" ON stories;

CREATE POLICY "Users can create own stories" 
ON stories FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Anyone can delete stories" ON stories;
DROP POLICY IF EXISTS "Users can delete own stories" ON stories;

CREATE POLICY "Users can delete own stories" 
ON stories FOR DELETE 
TO authenticated
USING (auth.uid() = author_id);

-- Fix story_views policies
DROP POLICY IF EXISTS "Anyone can create story views" ON story_views;
DROP POLICY IF EXISTS "Users can mark stories as viewed" ON story_views;

CREATE POLICY "Users can mark stories as viewed" 
ON story_views FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = viewer_id);

-- Fix post_likes policies  
DROP POLICY IF EXISTS "Anyone can like posts" ON post_likes;
DROP POLICY IF EXISTS "Users can like posts" ON post_likes;

CREATE POLICY "Users can like posts" 
ON post_likes FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone can unlike posts" ON post_likes;
DROP POLICY IF EXISTS "Users can unlike their own likes" ON post_likes;

CREATE POLICY "Users can unlike their own likes" 
ON post_likes FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);

-- Fix reel_likes policies
DROP POLICY IF EXISTS "Anyone can like reels" ON reel_likes;
DROP POLICY IF EXISTS "Users can like reels" ON reel_likes;

CREATE POLICY "Users can like reels" 
ON reel_likes FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone can unlike reels" ON reel_likes;
DROP POLICY IF EXISTS "Users can unlike their own reel likes" ON reel_likes;

CREATE POLICY "Users can unlike their own reel likes" 
ON reel_likes FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);

-- D1: Add missing indexes for performance (without partial indexes using now())
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at_desc ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_is_published ON posts(is_published) WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);

CREATE INDEX IF NOT EXISTS idx_stories_author_id ON stories(author_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON stories(expires_at);
CREATE INDEX IF NOT EXISTS idx_stories_author_expires ON stories(author_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_story_views_viewer_id ON story_views(viewer_id);
CREATE INDEX IF NOT EXISTS idx_story_views_story_id ON story_views(story_id);

CREATE INDEX IF NOT EXISTS idx_reels_author_id ON reels(author_id);
CREATE INDEX IF NOT EXISTS idx_reels_created_at_desc ON reels(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_followers_follower_id ON followers(follower_id);
CREATE INDEX IF NOT EXISTS idx_followers_following_id ON followers(following_id);

CREATE INDEX IF NOT EXISTS idx_post_media_post_id ON post_media(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user_id ON post_likes(user_id);

CREATE INDEX IF NOT EXISTS idx_reel_likes_reel_id ON reel_likes(reel_id);
CREATE INDEX IF NOT EXISTS idx_reel_likes_user_id ON reel_likes(user_id);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation_id ON conversation_participants(conversation_id);

-- D2: Create function to clean up expired stories (to be called by cron or manually)
CREATE OR REPLACE FUNCTION public.cleanup_expired_stories()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count integer;
BEGIN
    DELETE FROM public.stories 
    WHERE expires_at < now() - interval '1 day';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$;

-- D3: Add constraint to limit stories per user (max 100 active stories)
CREATE OR REPLACE FUNCTION public.check_stories_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_count integer;
BEGIN
    SELECT COUNT(*) INTO current_count
    FROM public.stories
    WHERE author_id = NEW.author_id
    AND expires_at > now();
    
    IF current_count >= 100 THEN
        RAISE EXCEPTION 'Maximum stories limit (100) reached for this user';
    END IF;
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_stories_limit ON stories;
CREATE TRIGGER enforce_stories_limit
    BEFORE INSERT ON stories
    FOR EACH ROW
    EXECUTE FUNCTION public.check_stories_limit();