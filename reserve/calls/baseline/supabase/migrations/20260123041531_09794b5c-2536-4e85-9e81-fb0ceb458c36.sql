-- Create calls table for audio/video calls
CREATE TABLE public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  caller_id UUID NOT NULL,
  callee_id UUID NOT NULL,
  call_type TEXT NOT NULL CHECK (call_type IN ('audio', 'video')),
  status TEXT NOT NULL DEFAULT 'calling' CHECK (status IN ('calling', 'ringing', 'active', 'ended', 'declined', 'missed')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- RLS policies for calls
CREATE POLICY "Users can view their own calls"
ON public.calls FOR SELECT
USING (auth.uid() = caller_id OR auth.uid() = callee_id);

CREATE POLICY "Users can create calls"
ON public.calls FOR INSERT
WITH CHECK (auth.uid() = caller_id);

CREATE POLICY "Users can update their own calls"
ON public.calls FOR UPDATE
USING (auth.uid() = caller_id OR auth.uid() = callee_id);

-- Enable realtime for calls
ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;

-- Create index for faster queries
CREATE INDEX idx_calls_participants ON public.calls(caller_id, callee_id);
CREATE INDEX idx_calls_conversation ON public.calls(conversation_id);
CREATE INDEX idx_calls_status ON public.calls(status) WHERE status IN ('calling', 'ringing', 'active');