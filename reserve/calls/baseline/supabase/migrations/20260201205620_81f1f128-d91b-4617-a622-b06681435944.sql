-- Create video_calls table
CREATE TABLE public.video_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id UUID NOT NULL,
  callee_id UUID NOT NULL,
  conversation_id UUID REFERENCES public.conversations(id),
  call_type TEXT NOT NULL DEFAULT 'video', -- 'video' | 'audio'
  status TEXT NOT NULL DEFAULT 'ringing', -- 'ringing' | 'answered' | 'declined' | 'ended' | 'missed'
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  ice_restart_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create video_call_signals table for DB fallback signaling
CREATE TABLE public.video_call_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES public.video_calls(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  signal_type TEXT NOT NULL, -- 'offer' | 'answer' | 'ice-candidate' | 'ready' | 'hangup'
  signal_data JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_video_calls_caller ON public.video_calls(caller_id);
CREATE INDEX idx_video_calls_callee ON public.video_calls(callee_id);
CREATE INDEX idx_video_calls_status ON public.video_calls(status);
CREATE INDEX idx_video_call_signals_call_id ON public.video_call_signals(call_id);
CREATE INDEX idx_video_call_signals_unprocessed ON public.video_call_signals(call_id, processed) WHERE processed = false;

-- Enable RLS
ALTER TABLE public.video_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_call_signals ENABLE ROW LEVEL SECURITY;

-- RLS policies for video_calls
CREATE POLICY "Users can view their own calls"
ON public.video_calls FOR SELECT
USING (auth.uid() = caller_id OR auth.uid() = callee_id);

CREATE POLICY "Users can create calls"
ON public.video_calls FOR INSERT
WITH CHECK (auth.uid() = caller_id);

CREATE POLICY "Participants can update calls"
ON public.video_calls FOR UPDATE
USING (auth.uid() = caller_id OR auth.uid() = callee_id);

-- RLS policies for video_call_signals
CREATE POLICY "Call participants can view signals"
ON public.video_call_signals FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.video_calls
    WHERE id = video_call_signals.call_id
    AND (caller_id = auth.uid() OR callee_id = auth.uid())
  )
);

CREATE POLICY "Call participants can insert signals"
ON public.video_call_signals FOR INSERT
WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (
    SELECT 1 FROM public.video_calls
    WHERE id = video_call_signals.call_id
    AND (caller_id = auth.uid() OR callee_id = auth.uid())
  )
);

CREATE POLICY "Participants can update their signals"
ON public.video_call_signals FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.video_calls
    WHERE id = video_call_signals.call_id
    AND (caller_id = auth.uid() OR callee_id = auth.uid())
  )
);

-- Enable realtime for signaling
ALTER PUBLICATION supabase_realtime ADD TABLE public.video_calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.video_call_signals;

-- Trigger to update updated_at
CREATE TRIGGER update_video_calls_updated_at
BEFORE UPDATE ON public.video_calls
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to auto-set call as missed after timeout
CREATE OR REPLACE FUNCTION public.check_missed_calls()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.video_calls
  SET status = 'missed', ended_at = now()
  WHERE status = 'ringing'
  AND created_at < now() - interval '60 seconds';
END;
$$;