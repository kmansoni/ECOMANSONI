-- Extend profiles table with bio, website, verified
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS website TEXT,
ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;

-- Create followers table for user subscriptions
CREATE TABLE public.followers (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    follower_id UUID NOT NULL,
    following_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(follower_id, following_id)
);

-- Create saved_posts table for bookmarked posts
CREATE TABLE public.saved_posts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    post_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, post_id)
);

-- Enable RLS
ALTER TABLE public.followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;

-- Followers RLS policies
CREATE POLICY "Anyone can view followers" ON public.followers
    FOR SELECT USING (true);

CREATE POLICY "Users can follow others" ON public.followers
    FOR INSERT WITH CHECK (auth.uid() = follower_id AND follower_id != following_id);

CREATE POLICY "Users can unfollow" ON public.followers
    FOR DELETE USING (auth.uid() = follower_id);

-- Saved posts RLS policies
CREATE POLICY "Users can view own saved posts" ON public.saved_posts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can save posts" ON public.saved_posts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unsave posts" ON public.saved_posts
    FOR DELETE USING (auth.uid() = user_id);

-- Performance indexes
CREATE INDEX idx_followers_follower ON public.followers(follower_id);
CREATE INDEX idx_followers_following ON public.followers(following_id);
CREATE INDEX idx_saved_posts_user ON public.saved_posts(user_id);
CREATE INDEX idx_saved_posts_post ON public.saved_posts(post_id);

-- Add foreign key for saved_posts to posts
ALTER TABLE public.saved_posts
ADD CONSTRAINT fk_saved_posts_post FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;