-- Remove FK constraint on owner_id to allow demo data
-- In production, you might want to keep this constraint
ALTER TABLE public.properties DROP CONSTRAINT IF EXISTS properties_owner_id_fkey;

-- Allow viewing all active properties without RLS for demo purposes
-- First drop the restrictive policies
DROP POLICY IF EXISTS "Anyone can view active properties" ON public.properties;

-- Create new permissive policy for viewing
CREATE POLICY "Anyone can view active properties" 
ON public.properties 
FOR SELECT 
USING (status = 'active'::property_status);