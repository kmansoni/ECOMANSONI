-- Add unique constraint to prevent duplicate views from same user/session per post
ALTER TABLE public.post_views 
ADD CONSTRAINT post_views_unique_view 
UNIQUE NULLS NOT DISTINCT (post_id, user_id, session_id);