-- Ensure blocked_users changes are delivered via Realtime (postgres_changes)

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.blocked_users;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
