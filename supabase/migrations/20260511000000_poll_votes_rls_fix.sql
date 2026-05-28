-- Fix poll_votes RLS to prevent unauthorized vote deletion
-- Split FOR ALL into separate policies with proper rules

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users manage own votes" ON poll_votes;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'poll_votes' AND policyname = 'Users view votes') THEN
    EXECUTE 'CREATE POLICY "Users view votes" ON poll_votes FOR SELECT USING (true)';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'poll_votes' AND policyname = 'Users insert own votes') THEN
    EXECUTE 'CREATE POLICY "Users insert own votes" ON poll_votes FOR INSERT WITH CHECK (user_id = auth.uid())';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'poll_votes' AND policyname = 'Users update own votes') THEN
    EXECUTE 'CREATE POLICY "Users update own votes" ON poll_votes FOR UPDATE USING (user_id = auth.uid())';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'poll_votes' AND policyname = 'Users delete own votes') THEN
    EXECUTE 'CREATE POLICY "Users delete own votes" ON poll_votes FOR DELETE USING (user_id = auth.uid())';
  END IF;
END $$;
