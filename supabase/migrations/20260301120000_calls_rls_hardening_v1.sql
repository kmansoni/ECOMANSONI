-- Calls RLS hardening (Phase 1)
-- Goal: tighten UPDATE policies to enforce explicit WITH CHECK conditions.

-- video_calls UPDATE: must remain participant on resulting row and status must be known value.
DROP POLICY IF EXISTS "Participants can update calls" ON public.video_calls;
CREATE POLICY "Participants can update calls"
ON public.video_calls FOR UPDATE
USING (auth.uid() = caller_id OR auth.uid() = callee_id)
WITH CHECK (
  (auth.uid() = caller_id OR auth.uid() = callee_id)
  AND status IN ('ringing', 'answered', 'declined', 'ended', 'missed')
);

-- video_call_signals UPDATE: only signal author can update their own signal,
-- and only while still being a participant of the related call.
DROP POLICY IF EXISTS "Participants can update their signals" ON public.video_call_signals;
CREATE POLICY "Participants can update their signals"
ON public.video_call_signals FOR UPDATE
USING (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM public.video_calls vc
    WHERE vc.id = video_call_signals.call_id
      AND (vc.caller_id = auth.uid() OR vc.callee_id = auth.uid())
  )
)
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM public.video_calls vc
    WHERE vc.id = video_call_signals.call_id
      AND (vc.caller_id = auth.uid() OR vc.callee_id = auth.uid())
  )
);
