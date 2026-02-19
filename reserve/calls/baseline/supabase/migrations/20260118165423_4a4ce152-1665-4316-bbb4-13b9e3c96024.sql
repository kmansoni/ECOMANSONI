-- Fix function search_path for update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix permissive RLS policy for property_views (require authentication for inserts)
DROP POLICY IF EXISTS "Anyone can record views" ON public.property_views;
CREATE POLICY "Authenticated users can record views" ON public.property_views
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL OR auth.uid() IS NULL);

-- Actually, for property views we want to allow anonymous tracking too
-- So let's allow it but in a controlled way - require property_id to exist
DROP POLICY IF EXISTS "Authenticated users can record views" ON public.property_views;
CREATE POLICY "Views can be recorded for valid properties" ON public.property_views
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.properties WHERE id = property_id AND status = 'active')
  );