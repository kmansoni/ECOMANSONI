-- v2.8 Platform Core RLS Policies
--
-- Section 5: RLS deny-by-default + REVOKE direct writes
-- All writes go through SECURITY DEFINER RPC only
-- Reads are policy-gated per scope membership and role
--
-- Created: 2026-02-24

-- ============================================================================
-- RLS Policy: core_scopes (read access gated by membership)
-- ============================================================================

CREATE POLICY core_scopes_read_member ON public.core_scopes
  FOR SELECT
  USING (
    -- User can see scope if they are a member
    EXISTS (
      SELECT 1 FROM public.core_scope_members
      WHERE scope_id = core_scopes.scope_id
        AND user_id = auth.uid()
        AND join_state IN ('joined', 'invited')
    )
    OR
    -- Public scopes are readable by anyone
    (visibility = 'public')
    OR
    -- Service role can read all
    auth.role() = 'service'
  );

-- No direct insert, update, delete on core_scopes
CREATE POLICY core_scopes_deny_all_write ON public.core_scopes
  FOR INSERT WITH CHECK (FALSE);

CREATE POLICY core_scopes_deny_all_update ON public.core_scopes
  FOR UPDATE USING (FALSE);

CREATE POLICY core_scopes_deny_all_delete ON public.core_scopes
  FOR DELETE USING (FALSE);

-- ============================================================================
-- RLS Policy: core_events (read access within scope membership)
-- ============================================================================

CREATE POLICY core_events_read_member ON public.core_events
  FOR SELECT
  USING (
    -- User can read events from scopes they're in
    EXISTS (
      SELECT 1 FROM public.core_scope_members
      WHERE scope_id = core_events.scope_id
        AND user_id = auth.uid()
        AND join_state IN ('joined', 'invited')
    )
    OR
    -- Service role can read all
    auth.role() = 'service'
  );

-- Deny all writes (append-only, no updates)
CREATE POLICY core_events_deny_all_write ON public.core_events
  FOR INSERT WITH CHECK (FALSE);

CREATE POLICY core_events_deny_all_update ON public.core_events
  FOR UPDATE USING (FALSE);

CREATE POLICY core_events_deny_all_delete ON public.core_events
  FOR DELETE USING (FALSE);

-- ============================================================================
-- RLS Policy: core_scope_members (read own membership, modify via RPC)
-- ============================================================================

CREATE POLICY core_scope_members_read_own ON public.core_scope_members
  FOR SELECT
  USING (
    -- Users can read their own membership
    user_id = auth.uid()
    OR
    -- Admins/moderators can read members within their scopes
    EXISTS (
      SELECT 1 FROM public.core_scope_members AS cm2
      WHERE cm2.scope_id = core_scope_members.scope_id
        AND cm2.user_id = auth.uid()
        AND cm2.role IN ('owner', 'admin', 'moderator')
    )
    OR
    -- Service role can read all
    auth.role() = 'service'
  );

-- Deny all writes (modify via RPC)
CREATE POLICY core_scope_members_deny_all_write ON public.core_scope_members
  FOR INSERT WITH CHECK (FALSE);

CREATE POLICY core_scope_members_deny_all_update ON public.core_scope_members
  FOR UPDATE USING (FALSE);

CREATE POLICY core_scope_members_deny_all_delete ON public.core_scope_members
  FOR DELETE USING (FALSE);

-- ============================================================================
-- RLS Policy: scope_invites (read own invites, modify via RPC)
-- ============================================================================

CREATE POLICY scope_invites_read_own ON public.scope_invites
  FOR SELECT
  USING (
    -- User can read their own invites
    invited_user = auth.uid()
    OR
    -- Admins of the scope can read all invites
    EXISTS (
      SELECT 1 FROM public.core_scope_members
      WHERE scope_id = scope_invites.scope_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
    OR
    -- Service role
    auth.role() = 'service'
  );

-- Deny all writes
CREATE POLICY scope_invites_deny_all_write ON public.scope_invites
  FOR INSERT WITH CHECK (FALSE);

CREATE POLICY scope_invites_deny_all_update ON public.scope_invites
  FOR UPDATE USING (FALSE);

CREATE POLICY scope_invites_deny_all_delete ON public.scope_invites
  FOR DELETE USING (FALSE);

-- ============================================================================
-- RLS Policy: core_receipts (read/write own receipts only)
-- ============================================================================

CREATE POLICY core_receipts_read_own ON public.core_receipts
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR
    auth.role() = 'service'
  );

-- Users can update their own receipts via RPC
CREATE POLICY core_receipts_update_own ON public.core_receipts
  FOR UPDATE USING (FALSE);  -- Actual updates go through RPC

CREATE POLICY core_receipts_insert_own ON public.core_receipts
  FOR INSERT WITH CHECK (FALSE);  -- Actual inserts go through RPC

CREATE POLICY core_receipts_delete_own ON public.core_receipts
  FOR DELETE USING (FALSE);

-- ============================================================================
-- RLS Policy: idempotency_outcomes_hot (read own outcomes)
-- ============================================================================

CREATE POLICY idempotency_outcomes_hot_read_own ON public.idempotency_outcomes_hot
  FOR SELECT
  USING (
    actor_id = auth.uid()
    OR
    auth.role() = 'service'
  );

-- Deny all writes (RPC only)
CREATE POLICY idempotency_outcomes_hot_deny_write ON public.idempotency_outcomes_hot
  FOR INSERT WITH CHECK (FALSE);

CREATE POLICY idempotency_outcomes_hot_deny_update ON public.idempotency_outcomes_hot
  FOR UPDATE USING (FALSE);

CREATE POLICY idempotency_outcomes_hot_deny_delete ON public.idempotency_outcomes_hot
  FOR DELETE USING (FALSE);

-- ============================================================================
-- RLS Policy: idempotency_outcomes_archive (read own outcomes)
-- ============================================================================

CREATE POLICY idempotency_outcomes_archive_read_own ON public.idempotency_outcomes_archive
  FOR SELECT
  USING (
    actor_id = auth.uid()
    OR
    auth.role() = 'service'
  );

-- Deny all writes
CREATE POLICY idempotency_outcomes_archive_deny_write ON public.idempotency_outcomes_archive
  FOR INSERT WITH CHECK (FALSE);

CREATE POLICY idempotency_outcomes_archive_deny_update ON public.idempotency_outcomes_archive
  FOR UPDATE USING (FALSE);

CREATE POLICY idempotency_outcomes_archive_deny_delete ON public.idempotency_outcomes_archive
  FOR DELETE USING (FALSE);

-- ============================================================================
-- RLS Policy: idempotency_locks (service role only)
-- ============================================================================

CREATE POLICY idempotency_locks_service_only ON public.idempotency_locks
  FOR ALL
  USING (auth.role() = 'service')
  WITH CHECK (auth.role() = 'service');

-- ============================================================================
-- RLS Policy: projection_watermarks (service role + members read)
-- ============================================================================

CREATE POLICY projection_watermarks_read_members ON public.projection_watermarks
  FOR SELECT
  USING (
    -- Members can read watermarks
    EXISTS (
      SELECT 1 FROM public.core_scope_members
      WHERE scope_id = projection_watermarks.scope_id
        AND user_id = auth.uid()
        AND join_state IN ('joined', 'invited')
    )
    OR
    -- Service role
    auth.role() = 'service'
  );

-- Deny all writes (service RPC only)
CREATE POLICY projection_watermarks_deny_all_write ON public.projection_watermarks
  FOR INSERT WITH CHECK (FALSE);

CREATE POLICY projection_watermarks_deny_all_update ON public.projection_watermarks
  FOR UPDATE USING (FALSE);

CREATE POLICY projection_watermarks_deny_all_delete ON public.projection_watermarks
  FOR DELETE USING (FALSE);

-- ============================================================================
-- RLS Policy: admin_action_log (service + admins read, service write)
-- ============================================================================

CREATE POLICY admin_action_log_read_admin ON public.admin_action_log
  FOR SELECT
  USING (
    -- Admins can read actions for their scopes
    EXISTS (
      SELECT 1 FROM public.core_scope_members
      WHERE scope_id = admin_action_log.target_scope_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
    OR
    -- Service role
    auth.role() = 'service'
  );

-- Deny all direct writes
CREATE POLICY admin_action_log_deny_all_write ON public.admin_action_log
  FOR INSERT WITH CHECK (FALSE);

-- ============================================================================
-- Summary: All tables have RLS enabled
-- All direct writes forbidden via RLS + REVOKE
-- All mutations go through SECURITY DEFINER RPC layer
-- ============================================================================
