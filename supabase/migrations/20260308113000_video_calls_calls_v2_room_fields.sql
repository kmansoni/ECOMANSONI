-- Persist calls-v2 room metadata on call record so callee can bootstrap into the same SFU room.
ALTER TABLE public.video_calls
  ADD COLUMN IF NOT EXISTS calls_v2_room_id TEXT,
  ADD COLUMN IF NOT EXISTS calls_v2_join_token TEXT;

COMMENT ON COLUMN public.video_calls.calls_v2_room_id IS
  'calls-v2 SFU room id created by caller and reused by callee';
COMMENT ON COLUMN public.video_calls.calls_v2_join_token IS
  'calls-v2 one-time join token for callee room bootstrap';

CREATE INDEX IF NOT EXISTS idx_video_calls_calls_v2_room_id
  ON public.video_calls (calls_v2_room_id)
  WHERE calls_v2_room_id IS NOT NULL;
