-- Function to create notification on post like
CREATE OR REPLACE FUNCTION public.handle_post_like_notification()
RETURNS TRIGGER AS $$
DECLARE
    post_author_id UUID;
BEGIN
    SELECT author_id INTO post_author_id FROM public.posts WHERE id = NEW.post_id;
    IF post_author_id IS NOT NULL AND post_author_id != NEW.user_id THEN
        INSERT INTO public.notifications (user_id, type, actor_id, post_id)
        VALUES (post_author_id, 'like', NEW.user_id, NEW.post_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_post_like_create_notification ON public.post_likes;
CREATE TRIGGER on_post_like_create_notification
    AFTER INSERT ON public.post_likes
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_post_like_notification();

-- Function to create notification on comment
CREATE OR REPLACE FUNCTION public.handle_comment_notification()
RETURNS TRIGGER AS $$
DECLARE
    post_author_id UUID;
BEGIN
    SELECT author_id INTO post_author_id FROM public.posts WHERE id = NEW.post_id;
    IF post_author_id IS NOT NULL AND post_author_id != NEW.author_id THEN
        INSERT INTO public.notifications (user_id, type, actor_id, post_id, comment_id, content)
        VALUES (post_author_id, 'comment', NEW.author_id, NEW.post_id, NEW.id, LEFT(NEW.content, 100));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_comment_create_notification ON public.comments;
CREATE TRIGGER on_comment_create_notification
    AFTER INSERT ON public.comments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_comment_notification();

-- Function to create notification on follow
CREATE OR REPLACE FUNCTION public.handle_follow_notification()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.notifications (user_id, type, actor_id)
    VALUES (NEW.following_id, 'follow', NEW.follower_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_follow_create_notification ON public.followers;
CREATE TRIGGER on_follow_create_notification
    AFTER INSERT ON public.followers
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_follow_notification();

-- Function to update reel likes count
CREATE OR REPLACE FUNCTION public.update_reel_likes_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.reels SET likes_count = likes_count + 1 WHERE id = NEW.reel_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.reels SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.reel_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_reel_like_update_count ON public.reel_likes;
CREATE TRIGGER on_reel_like_update_count
    AFTER INSERT OR DELETE ON public.reel_likes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_reel_likes_count();

-- Function to update reel views count
CREATE OR REPLACE FUNCTION public.update_reel_views_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.reels SET views_count = views_count + 1 WHERE id = NEW.reel_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_reel_view_update_count ON public.reel_views;
CREATE TRIGGER on_reel_view_update_count
    AFTER INSERT ON public.reel_views
    FOR EACH ROW
    EXECUTE FUNCTION public.update_reel_views_count();