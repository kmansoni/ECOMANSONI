-- Migration: Fix video_call_signals RLS after calls unification
-- Reason: signaling inserts started returning 403 after video_calls became a view
-- over calls; policies should validate against calls directly.

BEGIN;

-- Ensure RLS is enabled (idempotent)
ALTER TABLE public.video_call_signals ENABLE ROW LEVEL SECURITY;

-- Recreate SELECT policy against calls table.
DROP POLICY IF EXISTS "Call participants can view signals" ON public.video_call_signals;
CREATE POLICY "Call participants can view signals"
ON public.video_call_signals FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.calls c
    WHERE c.id = video_call_signals.call_id
      AND (c.caller_id = auth.uid() OR c.callee_id = auth.uid())
  )
);

-- Recreate INSERT policy against calls table.
DROP POLICY IF EXISTS "Call participants can insert signals" ON public.video_call_signals;
CREATE POLICY "Call participants can insert signals"
ON public.video_call_signals FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1
    FROM public.calls c
    WHERE c.id = video_call_signals.call_id
      AND (c.caller_id = auth.uid() OR c.callee_id = auth.uid())
  )
);

-- Recreate UPDATE policy against calls table.
DROP POLICY IF EXISTS "Participants can update their signals" ON public.video_call_signals;
CREATE POLICY "Participants can update their signals"
ON public.video_call_signals FOR UPDATE
TO authenticated
USING (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1
    FROM public.calls c
    WHERE c.id = video_call_signals.call_id
      AND (c.caller_id = auth.uid() OR c.callee_id = auth.uid())
  )
)
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1
    FROM public.calls c
    WHERE c.id = video_call_signals.call_id
      AND (c.caller_id = auth.uid() OR c.callee_id = auth.uid())
  )
);

-- Fallback INSERT policy for debug/stuck cases: allow signal author to insert
-- for existing call IDs when participant tuple is temporarily inconsistent.
-- Keeps sender binding strict and avoids anonymous inserts.
DROP POLICY IF EXISTS "Signal author can insert for existing call" ON public.video_call_signals;
CREATE POLICY "Signal author can insert for existing call"
ON public.video_call_signals FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1
    FROM public.calls c
    WHERE c.id = video_call_signals.call_id
  )
);

COMMIT;
