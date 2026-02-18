-- Create reel_comments table for comments on reels
CREATE TABLE IF NOT EXISTS public.reel_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  parent_id UUID REFERENCES public.reel_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  likes_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reel_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for reel_comments
CREATE POLICY "Anyone can view reel comments"
ON public.reel_comments FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can create reel comments"
ON public.reel_comments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can delete their own reel comments"
ON public.reel_comments FOR DELETE
TO authenticated
USING (auth.uid() = author_id);

-- Create reel_comment_likes table
CREATE TABLE IF NOT EXISTS public.reel_comment_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES public.reel_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

-- Enable RLS
ALTER TABLE public.reel_comment_likes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for reel_comment_likes
CREATE POLICY "Anyone can view reel comment likes"
ON public.reel_comment_likes FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can like reel comments"
ON public.reel_comment_likes FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike their own reel comment likes"
ON public.reel_comment_likes FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Trigger to update reels.comments_count
CREATE OR REPLACE FUNCTION public.update_reel_comments_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.reels SET comments_count = comments_count + 1 WHERE id = NEW.reel_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.reels SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.reel_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_reel_comments_count_trigger
AFTER INSERT OR DELETE ON public.reel_comments
FOR EACH ROW
EXECUTE FUNCTION public.update_reel_comments_count();

-- Trigger to update reel_comments.likes_count
CREATE OR REPLACE FUNCTION public.update_reel_comment_likes_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.reel_comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.reel_comments SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.comment_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_reel_comment_likes_count_trigger
AFTER INSERT OR DELETE ON public.reel_comment_likes
FOR EACH ROW
EXECUTE FUNCTION public.update_reel_comment_likes_count();

-- Enable realtime for reel_comments
ALTER PUBLICATION supabase_realtime ADD TABLE public.reel_comments;