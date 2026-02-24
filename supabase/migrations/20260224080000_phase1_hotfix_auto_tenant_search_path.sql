-- Phase 1 hotfix: ensure auth.users signup trigger can see public tables
-- Root cause: trigger execution context may not include public in search_path.
-- Fix: qualify public schema and set a safe search_path for SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.auto_create_personal_tenant_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_tenant_id UUID;
  v_display_name TEXT;
BEGIN
  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.tenants(name, status)
  VALUES (v_display_name || '''s Workspace', 'active')
  RETURNING tenant_id INTO v_tenant_id;

  INSERT INTO public.tenant_members(tenant_id, user_id, role)
  VALUES (v_tenant_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;
