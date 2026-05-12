-- Fix poll_votes RLS to prevent unauthorized vote deletion
-- Split FOR ALL into separate policies with proper rules

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users manage own votes" ON poll_votes;

-- Create separate policies with explicit rules
-- Users can SELECT their own votes (or all votes for transparency)
CREATE POLICY "Users view votes" ON poll_votes
  FOR SELECT USING (true);

-- Users can INSERT their own votes
CREATE POLICY "Users insert own votes" ON poll_votes
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can UPDATE their own votes (e.g., change vote before poll closes)
CREATE POLICY "Users update own votes" ON poll_votes
  FOR UPDATE USING (user_id = auth.uid());

-- Users can DELETE their own votes
CREATE POLICY "Users delete own votes" ON poll_votes
  FOR DELETE USING (user_id = auth.uid());