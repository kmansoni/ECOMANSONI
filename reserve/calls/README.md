# Calls reserve

This folder stores **snapshots** of the calls stack so we can safely improve calls and quickly restore a known-good state.

## What is included

- Client calls logic (WebRTC, signaling):
  - `src/contexts/VideoCallContext.tsx`
  - `src/hooks/useVideoCall.ts`
  - `src/hooks/useIncomingCalls.ts`
  - `src/lib/webrtc-config.ts`
  - `src/lib/sip-config.ts`
  - `src/components/chat/GlobalCallOverlay.tsx`

- Supabase Edge Functions:
  - `supabase/functions/turn-credentials/**`
  - `supabase/functions/sip-credentials/**`

- Supabase migrations that define calls tables + RLS + realtime:
  - `supabase/migrations/20260201205620_81f1f128-d91b-4617-a622-b06681435944.sql` (video_calls + video_call_signals)
  - `supabase/migrations/20260123041531_09794b5c-2536-4e85-9e81-fb0ceb458c36.sql` (legacy calls table)
  - `supabase/migrations/20260118165423_4a4ce152-1665-4316-bbb4-13b9e3c96024.sql` (update_updated_at_column)

## Commands

- Create a new snapshot:
  - `powershell -ExecutionPolicy Bypass -File ./scripts/backup-calls.ps1`

- Restore calls from reserve (baseline by default):
  - `powershell -ExecutionPolicy Bypass -File ./scripts/restore-calls.ps1`

Notes:
- This does **not** back up Supabase Secrets (TURN/SIP credentials). Secrets must be managed in Supabase.
